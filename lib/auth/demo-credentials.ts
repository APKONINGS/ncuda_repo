import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DEMO_PASSWORD } from "@/lib/demo/fixtures";
import { db } from "@/lib/demo/store";

/*
 * Demo-mode passwords. Members get a personal password (salted scrypt hash)
 * when they are created or when they change it on their profile; anyone
 * without one still signs in with the shared demo password. In production
 * this is Supabase Auth: the account is created by invitation and the member
 * changes their password through auth.updateUser().
 */

const SALT = "ncuda-demo-salt";
const DEMO_HASH = scryptSync(DEMO_PASSWORD, SALT, 32);

/**
 * Password rule shared by every form that sets one. TESTING ONLY: any
 * non-empty password is accepted (e.g. "0000"). Before the portal is hosted
 * this must become a real policy (length, and checks against common
 * passwords) — see docs/ARCHITECTURE.md.
 */
export const passwordRule = z.string().min(1, "Enter a password.").max(200, "That password is too long.");

const hashWith = (password: string, salt: string) => scryptSync(password, Buffer.from(salt, "hex"), 32);

const credentialOf = (memberId: string) => db().credentials?.find((c) => c.memberId === memberId) ?? null;

/** Finds the member signing in with this email (demo accounts first, then any member). */
function memberIdFor(email: string) {
  const wanted = email.trim().toLowerCase();
  return (
    db().accounts.find((a) => a.email.toLowerCase() === wanted)?.memberId ??
    db().members.find((m) => m.email.toLowerCase() === wanted)?.id ??
    null
  );
}

/** Does `password` match this member's password (their own, or the shared demo one if they have none)? */
export function passwordMatches(memberId: string, password: string): boolean {
  const own = credentialOf(memberId);
  const expected = own ? Buffer.from(own.hash, "hex") : DEMO_HASH;
  const candidate = own ? hashWith(password, own.salt) : scryptSync(password, SALT, 32);
  return timingSafeEqual(candidate, expected);
}

/** Verifies credentials in constant time. Returns the member id or null. */
export function verifyDemoCredentials(email: string, password: string): string | null {
  const memberId = memberIdFor(email);
  if (!memberId) {
    // Same work as a real check, so unknown emails can't be told apart by timing.
    timingSafeEqual(scryptSync(password, SALT, 32), DEMO_HASH);
    return null;
  }
  return passwordMatches(memberId, password) ? memberId : null;
}

/** Sets (or replaces) a member's password. `temporary` when someone else chose it for them. */
export function setMemberPassword(memberId: string, password: string, opts: { temporary: boolean; setBy: string | null }) {
  const d = db();
  d.credentials ??= [];
  const salt = randomBytes(16).toString("hex");
  const record = { memberId, salt, hash: hashWith(password, salt).toString("hex"), temporary: opts.temporary, setBy: opts.setBy, updatedAt: new Date().toISOString() };
  const i = d.credentials.findIndex((c) => c.memberId === memberId);
  if (i >= 0) d.credentials[i] = record;
  else d.credentials.push(record);
}

/** Is the member still using a password someone else set (or the shared demo one)? */
export function passwordStatus(memberId: string): "own" | "temporary" | "shared" {
  const own = credentialOf(memberId);
  return !own ? "shared" : own.temporary ? "temporary" : "own";
}

/* Simple in-memory throttle: 5 failed attempts per identifier per 15 minutes. */
const attempts = new Map<string, { count: number; first: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export function isThrottled(id: string) {
  const a = attempts.get(id);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) {
    attempts.delete(id);
    return false;
  }
  return a.count >= MAX_FAILURES;
}

export function recordFailure(id: string) {
  const a = attempts.get(id);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(id, { count: 1, first: Date.now() });
  else a.count += 1;
}

export function clearFailures(id: string) {
  attempts.delete(id);
}
