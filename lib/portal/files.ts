import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileStoreDir, loadRemoteFile, queueRemoteFile } from "@/lib/demo/store";
import { remoteEnabled } from "@/lib/demo/remote";

/**
 * Uploaded file handling.
 *
 * Demo mode keeps file bytes in server memory, and on disk next to the data
 * file when NCUDA_DEMO_STORE_FILE is set. In production the bytes go to the private
 * Supabase Storage bucket `documents` and only metadata lives in Postgres
 * (see supabase/migrations/…_storage.sql).
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

/** Common office documents and images. Anything else is refused. */
export const ALLOWED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "application/msword": "Word",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.ms-excel": "Excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.ms-powerpoint": "PowerPoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
  "text/plain": "Text",
  "image/jpeg": "Image",
  "image/png": "Image",
  "image/webp": "Image",
};

export const ACCEPT_ATTRIBUTE = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp";

export type IncomingFile = { name: string; type: string; size: number; bytes: Uint8Array };

/** Returns an error message, or null if the file is acceptable. */
export function checkFile(f: IncomingFile): string | null {
  if (f.size === 0) return `“${f.name}” is empty.`;
  if (f.size > MAX_FILE_BYTES) return `“${f.name}” is larger than 10 MB.`;
  // The online store takes up to 10 MB per request, and a file grows by a third when sent: 7 MB online.
  if (remoteEnabled() && f.size > 7 * 1024 * 1024) return `“${f.name}” is larger than 7 MB.`;
  if (!ALLOWED_TYPES[f.type]) return `“${f.name}” is not a supported file type (PDF, Word, Excel, PowerPoint, text or image).`;
  return null;
}

/** A filename safe to store and to send back in a Content-Disposition header. */
export function safeFilename(name: string) {
  const cleaned = name.replace(/[\\/:*?"<>|\r\n]+/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(-120) || "document";
}

const globalForFiles = globalThis as unknown as { __ncudaDemoFiles?: Map<string, { bytes: Uint8Array; type: string }> };
const store = () => (globalForFiles.__ncudaDemoFiles ??= new Map());

// When a demo store file is configured, uploads are also written to disk so they survive restarts.
const onDisk = (documentId: string) => {
  const dir = fileStoreDir();
  return dir ? join(dir, documentId.replace(/[^a-zA-Z0-9_-]/g, "_")) : null;
};

export function putFile(documentId: string, bytes: Uint8Array, type: string) {
  store().set(documentId, { bytes, type });
  if (remoteEnabled()) queueRemoteFile(documentId, bytes, type);
  const path = onDisk(documentId);
  if (path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    writeFileSync(`${path}.type`, type);
  }
}

export function getFile(documentId: string) {
  const cached = store().get(documentId);
  if (cached) return cached;
  const path = onDisk(documentId);
  if (!path || !existsSync(path)) return null;
  const file = { bytes: new Uint8Array(readFileSync(path)), type: existsSync(`${path}.type`) ? readFileSync(`${path}.type`, "utf8") : "application/octet-stream" };
  store().set(documentId, file);
  return file;
}

/** Like getFile, but also looks in the online store (another copy of the site may have received the upload). */
export async function getFileAsync(documentId: string) {
  const local = getFile(documentId);
  if (local) return local;
  const remote = await loadRemoteFile(documentId);
  if (remote) store().set(documentId, remote);
  return remote;
}

/** Reads `File` entries from a form field into plain objects. */
export async function readFiles(values: FormDataEntryValue[]): Promise<IncomingFile[]> {
  const files = values.filter((v): v is File => typeof v === "object" && "arrayBuffer" in v && v.size > 0);
  return Promise.all(
    files.map(async (f) => ({ name: f.name, type: f.type, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) })),
  );
}
