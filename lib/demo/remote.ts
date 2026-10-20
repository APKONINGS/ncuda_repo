import "server-only";

/*
 * Online store for the demo data (Upstash Redis, over its REST API), used when
 * the portal is hosted somewhere without a lasting disk — such as Vercel, which
 * runs several short-lived copies of the site. All copies read and write the
 * same data here, so everyone sees the same portal and nothing is lost.
 *
 * Switched on by UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or the
 * KV_REST_API_URL + KV_REST_API_TOKEN names Vercel's Upstash integration uses).
 * Without them the portal keeps its data in memory / NCUDA_DEMO_STORE_FILE.
 *
 * Keys: <prefix>:ver (a counter bumped on every save), <prefix>:db (the data as
 * JSON) and <prefix>:file:<id> (uploaded files). To start the demo over, delete
 * the keys (or flush the database) in the Upstash console.
 */

const url = () => process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "";
const token = () => process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
const prefix = () => process.env.NCUDA_STORE_KEY || "ncuda-demo";

export const remoteEnabled = () => !!(url() && token());

export const keys = {
  ver: () => `${prefix()}:ver`,
  db: () => `${prefix()}:db`,
  file: (id: string) => `${prefix()}:file:${id}`,
};

type Reply = { result?: unknown; error?: string };

/** Runs one or more Redis commands in a single request (a pipeline). */
export async function redis(...commands: Array<Array<string | number>>): Promise<unknown[]> {
  const res = await fetch(`${url().replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands.map((c) => c.map(String))),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash request failed: ${res.status} ${await res.text().catch(() => "")}`);
  const replies = (await res.json()) as Reply[];
  return replies.map((r) => {
    if (r.error) throw new Error(`Upstash: ${r.error}`);
    return r.result ?? null;
  });
}
