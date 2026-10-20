import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. BYPASSES Row Level Security.
 *
 * Server-only (enforced by the `server-only` import). Use it solely for
 * operations Supabase requires admin rights for — chiefly sending the account
 * invitation (auth.admin.inviteUserByEmail) AFTER the `create_member` RPC has
 * succeeded as the authorized officer. Never use it to read or write
 * application data on a user's behalf.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
