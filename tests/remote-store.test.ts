import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/*
 * The online store (Upstash Redis over REST), against an in-memory stand-in
 * that answers like Upstash's /pipeline endpoint. "Another copy of the site"
 * is simulated by clearing this process's copy of the data.
 */
const redisData = new Map<string, string>();
const fakeUpstash = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
  if (init.headers.Authorization !== "Bearer test-token") return new Response("unauthorized", { status: 401 });
  const commands = JSON.parse(init.body) as string[][];
  const replies = commands.map(([cmd, key, value]) => {
    if (cmd === "GET") return { result: redisData.get(key) ?? null };
    if (cmd === "SET") {
      redisData.set(key, value);
      return { result: "OK" };
    }
    if (cmd === "INCR") {
      const n = Number(redisData.get(key) ?? 0) + 1;
      redisData.set(key, String(n));
      return { result: n };
    }
    return { error: `unknown command ${cmd}` };
  });
  return new Response(JSON.stringify(replies), { status: 200 });
});

const g = globalThis as unknown as { __ncudaDemoDB?: unknown; __ncudaDemoVer?: number; __ncudaDemoFiles?: Map<string, unknown> };
/** Forget this copy's data, as a different copy of the site would start. */
const anotherCopy = () => {
  delete g.__ncudaDemoDB;
  delete g.__ncudaDemoVer;
  g.__ncudaDemoFiles?.clear();
};

beforeAll(() => {
  vi.stubGlobal("fetch", fakeUpstash);
  process.env.UPSTASH_REDIS_REST_URL = "https://example-upstash.invalid";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
  anotherCopy();
});
afterAll(() => {
  vi.unstubAllGlobals();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  anotherCopy();
});

describe("online store", () => {
  it("an empty store starts with the initial data; every copy of the site then shares one set of data", async () => {
    const { db, flushStore, syncStore } = await import("@/lib/demo/store");
    await syncStore();
    expect(redisData.get("ncuda-demo:ver")).toBe("1");
    expect(JSON.parse(redisData.get("ncuda-demo:db")!).members.length).toBeGreaterThan(0);

    // Copy A records a change and saves it.
    db().regions.push({ id: "reg_online", name: "Example online region" });
    await flushStore();
    expect(redisData.get("ncuda-demo:ver")).toBe("2");

    // Copy B starts fresh and sees it.
    anotherCopy();
    await syncStore();
    expect(db().regions.some((r) => r.id === "reg_online")).toBe(true);

    // A copy holding older data picks up the newer version on its next request.
    const stale = { ...(db() as object), regions: [] };
    g.__ncudaDemoDB = stale;
    g.__ncudaDemoVer = 1;
    await syncStore();
    expect(db().regions.some((r) => r.id === "reg_online")).toBe(true);
  });

  it("uploads are kept in the online store, so another copy can serve the download", async () => {
    const { flushStore } = await import("@/lib/demo/store");
    const { getFileAsync, putFile } = await import("@/lib/portal/files");
    putFile("doc_online", new Uint8Array([37, 80, 68, 70]), "application/pdf");
    await flushStore();
    anotherCopy();
    const file = await getFileAsync("doc_online");
    expect(file?.type).toBe("application/pdf");
    expect([...(file?.bytes ?? [])]).toEqual([37, 80, 68, 70]);
  });

  it("very large uploads are refused online (the store takes up to 10 MB per request)", async () => {
    const { checkFile } = await import("@/lib/portal/files");
    const big = { name: "big.pdf", type: "application/pdf", size: 8 * 1024 * 1024, bytes: new Uint8Array(0) };
    expect(checkFile(big)).toContain("7 MB");
  });
});
