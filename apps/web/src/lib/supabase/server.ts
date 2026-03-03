/**
 * Supabase server clients.
 *
 * Usage rules:
 * 1) createServerClientWithCookies()
 *    - For Server Components and Route Handlers that need the signed-in user session.
 *    - Uses `cookies()` and anon key.
 *    - Typical use: auth checks (`supabase.auth.getUser()`).
 *
 * 2) createServiceRoleClient()
 *    - For server-only admin operations that require RLS bypass.
 *    - Never expose service-role key in client bundles.
 *    - Use in Route Handlers only after explicit authorization checks.
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSupabaseConfiguredServer(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return isValidHttpUrl(url) && key.length > 0;
}

/**
 * Cookie-based Supabase client for Server Components and Route Handlers.
 * Uses cookies() for auth session. Use when you need the logged-in user.
 */
export async function createServerClientWithCookies() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return Promise.resolve(cookieStore.getAll());
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component: cannot set cookies; middleware handles refresh
        }
      },
    },
  });
}

/**
 * Service role Supabase client (bypasses RLS). Use in API Routes only.
 * Never expose this client or SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}

/** @deprecated Use createServiceRoleClient(). */
export function createSupabaseServerClient() {
  return createServiceRoleClient();
}

/** @deprecated Use createServiceRoleClient(). */
export function getServerClient() {
  return createServiceRoleClient();
}
