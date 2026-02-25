/**
 * Supabase server clients.
 * - createServerClient(): cookie-based session (Server Components, Route Handlers with auth).
 *   Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * - createServiceRoleClient(): service role (API Routes that need admin/RLS bypass).
 *   Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "./types";

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
        return cookieStore.getAll();
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

/**
 * Default server client for API Routes: service role (admin).
 * For session-based auth in server code, use createServerClientWithCookies().
 */
export function createServerClient() {
  return createServiceRoleClient();
}
