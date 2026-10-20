import "server-only";

/**
 * Authentication mode.
 *  - "demo": built-in fictional accounts and an in-memory store (V1 default).
 *  - "supabase": Supabase Auth + Postgres with RLS. The schema and client
 *    helpers are in place (supabase/, lib/supabase); wiring the portal
 *    repositories to Supabase is the next milestone — see docs/ARCHITECTURE.md.
 */
export type AuthMode = "demo" | "supabase";

export function authMode(): AuthMode {
  return process.env.NCUDA_AUTH_MODE === "supabase" ? "supabase" : "demo";
}

export const SESSION_COOKIE = "ncuda_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

/**
 * Secret used to sign demo session cookies. A development fallback is used
 * locally; production refuses to run demo sessions without a real secret.
 */
export function sessionSecret(): string | null {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV !== "production") return "dev-only-insecure-secret-change-me-0123456789";
  return null;
}
