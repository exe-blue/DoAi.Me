import { createServerClient } from "@supabase/ssr";
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

/**
 * Returns true if the required Supabase environment variables are present
 * and the URL is a valid HTTP/HTTPS URL.
 */
export function isSupabaseConfiguredServer(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return isValidHttpUrl(url) && key.length > 0;
}


/**
 * Supabase client for Server Components / Route Handlers.
 * Uses cookies for auth session. Session refresh is done in middleware.
 */
export async function createAuthServerClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!isValidHttpUrl(url) || !key) {
    throw new Error(
      "[Supabase] Server client not initialized – NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set.\n\n" +
      "To fix this:\n" +
      "1. Copy .env.example to .env.local: cp .env.example .env.local\n" +
      "2. Add your Supabase credentials to .env.local\n" +
      "3. Get credentials from: https://supabase.com/dashboard/project/_/settings/api"
    );
  }

  return createServerClient<Database>(
    url,
    key,
    {
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
    }
  );
}
