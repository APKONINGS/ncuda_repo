"use client";

import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./env";

/**
 * Browser client — publishable key only. It can do nothing the signed-in
 * user's RLS policies don't allow. Never import the service-role client here.
 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = supabaseConfig();
  return createBrowserClient(url, publishableKey);
}
