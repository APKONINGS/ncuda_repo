import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts AS THE SIGNED-IN USER: every query is subject to Row Level Security.
 */
export async function createSupabaseServerClient() {
  const { url, publishableKey } = supabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // session is refreshed by the next Server Action / Route Handler.
        }
      },
    },
  });
}
