import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, sessionSecret } from "./config";

interface SessionPayload {
  sub: string; // member id
  sid: string; // session id
  iat: number;
  exp: number;
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function encodeSession(memberId: string): string {
  const secret = sessionSecret();
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = { sub: memberId, sid: randomUUID(), iat: now, exp: now + SESSION_TTL_SECONDS };
  const body = b64(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function decodeSession(token: string | undefined): SessionPayload | null {
  const secret = sessionSecret();
  if (!token || !secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (typeof payload.sub !== "string" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function readSession() {
  const store = await cookies();
  return decodeSession(store.get(SESSION_COOKIE)?.value);
}

export async function writeSession(memberId: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, encodeSession(memberId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
