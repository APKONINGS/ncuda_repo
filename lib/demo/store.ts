import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { after } from "next/server";
import { createCleanStart, createFixtures, type DemoDB } from "./fixtures";
import { keys, redis, remoteEnabled } from "./remote";
import stakeholderSeed from "./stakeholder-seed.json";

/**
 * Demo database. Kept in memory for the life of the server process.
 *
 *  - NCUDA_DEMO_SEED=clean   starts with only the President General (for
 *                            testing with real people); anything else starts
 *                            with the fictional sample organisation.
 *  - NCUDA_DEMO_STORE_FILE   if set, the data is saved to this JSON file after
 *                            every change and reloaded on restart, so test
 *                            data survives restarts. Delete the file to start over.
 *
 *  - NCUDA_DEMO_SEED=stakeholders   starts from the prepared stakeholder demo
 *                            (lib/demo/stakeholder-seed.json).
 *  - Online store (lib/demo/remote.ts): when its settings are present (e.g. on
 *                            Vercel) the data lives there instead, shared by every
 *                            copy of the site: syncStore() loads the latest at the
 *                            start of each request, and changes are written back
 *                            when the request finishes.
 *
 * Replace with Supabase repositories for production (docs/ARCHITECTURE.md).
 */
const globalForDemo = globalThis as unknown as {
  __ncudaDemoDB?: DemoDB;
  /** The online store's version this copy holds. */
  __ncudaDemoVer?: number;
  __ncudaFlushQueued?: boolean;
  /** Uploaded files not yet written to the online store. */
  __ncudaPendingFiles?: Map<string, { bytes: Uint8Array; type: string }>;
};

/** The data a new store starts with. */
function initialData(): DemoDB {
  if (process.env.NCUDA_DEMO_SEED === "stakeholders" && stakeholderSeed) return structuredClone(stakeholderSeed) as unknown as DemoDB;
  return process.env.NCUDA_DEMO_SEED === "clean" ? createCleanStart() : createFixtures();
}

const storeFile = () => (process.env.NCUDA_DEMO_STORE_FILE ? resolve(process.env.NCUDA_DEMO_STORE_FILE) : null);

export function db(): DemoDB {
  if (!globalForDemo.__ncudaDemoDB && remoteEnabled()) {
    // Normally loaded by syncStore() first; this only covers code running outside a request.
    globalForDemo.__ncudaDemoDB = initialData();
  }
  if (!globalForDemo.__ncudaDemoDB) {
    const file = storeFile();
    if (file && existsSync(file)) {
      globalForDemo.__ncudaDemoDB = JSON.parse(readFileSync(file, "utf8")) as DemoDB;
    } else {
      globalForDemo.__ncudaDemoDB = initialData();
      saveDb();
    }
  }
  return globalForDemo.__ncudaDemoDB;
}

/**
 * Writes the data to NCUDA_DEMO_STORE_FILE (if configured): write a temporary
 * file, then rename it over the old one. On Windows the rename can briefly
 * fail while another program (antivirus, editor, file indexer) has the file
 * open, so it is retried and, failing that, written directly. Saving never
 * breaks the action that triggered it — the data is still in memory.
 */
export function saveDb() {
  if (remoteEnabled()) return queueFlush();
  const file = storeFile();
  if (!file || !globalForDemo.__ncudaDemoDB) return;
  const json = JSON.stringify(globalForDemo.__ncudaDemoDB);
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, json);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        renameSync(tmp, file);
        return;
      } catch {
        // busy-wait a few milliseconds before retrying (synchronous by design)
        const until = Date.now() + 20 * (attempt + 1);
        while (Date.now() < until);
      }
    }
    writeFileSync(file, json);
  } catch (e) {
    console.error("[demo store] could not save demo data:", e);
  }
}

/** Saves shortly after a burst of changes (e.g. several audit entries from one action) — once. */
let pending: ReturnType<typeof setTimeout> | null = null;
export function scheduleSave() {
  if (remoteEnabled()) return queueFlush();
  if (!storeFile() || pending) return;
  pending = setTimeout(() => {
    pending = null;
    saveDb();
  }, 100);
}

/* ── Online store ─────────────────────────────────────────────────────── */

/** Loads the latest data from the online store (if one is configured) — once per request, before reading. */
export async function syncStore() {
  if (!remoteEnabled()) return;
  const [ver] = await redis(["GET", keys.ver()]);
  if (ver === null) {
    // An empty store: start it with the initial data.
    const data = globalForDemo.__ncudaDemoDB ?? initialData();
    const [, v] = await redis(["SET", keys.db(), JSON.stringify(data)], ["INCR", keys.ver()]);
    globalForDemo.__ncudaDemoDB = data;
    globalForDemo.__ncudaDemoVer = Number(v);
    return;
  }
  if (!globalForDemo.__ncudaDemoDB || Number(ver) !== globalForDemo.__ncudaDemoVer) {
    const [json, v] = await redis(["GET", keys.db()], ["GET", keys.ver()]);
    globalForDemo.__ncudaDemoDB = JSON.parse(String(json)) as DemoDB;
    globalForDemo.__ncudaDemoVer = Number(v);
  }
}

/** Writes the data (and any new uploads) to the online store when the current request finishes. */
function queueFlush() {
  if (globalForDemo.__ncudaFlushQueued) return;
  globalForDemo.__ncudaFlushQueued = true;
  const run = () => flushStore().catch((e) => console.error("[demo store] could not save to the online store:", e));
  try {
    after(run);
  } catch {
    void run(); // outside a request (e.g. tests): write straight away
  }
}

/** Writes the data, then any new uploads, to the online store. */
export async function flushStore() {
  globalForDemo.__ncudaFlushQueued = false;
  const data = globalForDemo.__ncudaDemoDB;
  if (!data || !remoteEnabled()) return;
  const [, v] = await redis(["SET", keys.db(), JSON.stringify(data)], ["INCR", keys.ver()]);
  globalForDemo.__ncudaDemoVer = Number(v);
  const pendingFiles = globalForDemo.__ncudaPendingFiles;
  if (pendingFiles?.size) {
    const files = [...pendingFiles];
    pendingFiles.clear();
    // One request per file, so a problem with one upload never blocks saving the data.
    for (const [id, f] of files) {
      await redis(["SET", keys.file(id), JSON.stringify({ type: f.type, b64: Buffer.from(f.bytes).toString("base64") })]).catch((e) =>
        console.error(`[demo store] could not save upload ${id}:`, e),
      );
    }
  }
}

/** Queues an uploaded file for the online store. */
export function queueRemoteFile(id: string, bytes: Uint8Array, type: string) {
  (globalForDemo.__ncudaPendingFiles ??= new Map()).set(id, { bytes, type });
  queueFlush();
}

/** Reads an uploaded file from the online store. */
export async function loadRemoteFile(id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  if (!remoteEnabled()) return null;
  const pending = globalForDemo.__ncudaPendingFiles?.get(id);
  if (pending) return pending;
  const [raw] = await redis(["GET", keys.file(id)]);
  if (raw === null) return null;
  const f = JSON.parse(String(raw)) as { type: string; b64: string };
  return { bytes: new Uint8Array(Buffer.from(f.b64, "base64")), type: f.type };
}

/** Where uploaded files are kept on disk alongside the data file (null: memory only). */
export function fileStoreDir() {
  const file = storeFile();
  return file ? `${file}.files` : null;
}

export function newId(prefix: string) {
  const d = db();
  d.seq += 1;
  return `${prefix}_${d.seq}`;
}

export function currentChapterId(memberId: string): string | null {
  return db().affiliations.find((a) => a.memberId === memberId && a.endedAt === null)?.chapterId ?? null;
}

/** Does the member hold any office (an EXCO role at any level)? Projects expect a different amount from executives. */
export function isExecutive(memberId: string): boolean {
  return db().assignments.some((a) => a.memberId === memberId && a.status === "active");
}

/**
 * Next automatic receipt / voucher number for the year: RC-2026-00042 for
 * money received, PV-2026-00007 for money spent. In Supabase a trigger
 * assigns these from a counter table, so numbers are never reused.
 */
export function nextReference(kind: "RC" | "PV", year = new Date().getFullYear()): string {
  const d = db();
  const prefix = `${kind}-${year}-`;
  const rows: Array<{ reference: string }> = kind === "RC" ? d.contributions : d.expenses;
  const last = rows.reduce((max, r) => (r.reference.startsWith(prefix) ? Math.max(max, Number(r.reference.slice(prefix.length)) || 0) : max), 0);
  return `${prefix}${String(last + 1).padStart(5, "0")}`;
}
