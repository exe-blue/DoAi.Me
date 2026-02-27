import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

/**
 * Supabase client for Server Components / Route Handlers.
 * Uses cookies for auth session. Session refresh is done in middleware.
 */
export async function createAuthServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      `Missing Supabase environment variables. Please create .env.local file with:\n` +
      `NEXT_PUBLIC_SUPABASE_URL=your-supabase-url\n` +
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key\n\n` +
      `Run: cp .env.example .env.local`
    );
  }


  const cookieStore = await cookies();

  return createServerClient<Database>(
    url,
    key,
    {
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
    }
  );
}
