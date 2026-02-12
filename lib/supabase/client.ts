import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let cachedClient: SupabaseClient<Database> | null = null;
let warnedOnce = false;

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
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return isValidHttpUrl(url) && key.length > 0;
}

/**
 * Creates (or returns a cached) Supabase browser client.
 * Returns `null` when the required environment variables are missing or invalid,
 * allowing the app to render gracefully without Supabase connectivity.
 */
export function createClient(): SupabaseClient<Database> | null {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!isValidHttpUrl(url) || !key) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(
        "[Supabase] Client not initialised – NEXT_PUBLIC_SUPABASE_URL must be a valid HTTP/HTTPS URL " +
          "and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set. Realtime features will be disabled."
      );
    }
    return null;
  }

  cachedClient = createSupabaseClient<Database>(url, key);
  return cachedClient;
}
