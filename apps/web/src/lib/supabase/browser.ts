import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "./client";
import type { Database } from "./types";

/**
 * @deprecated Use createBrowserClient() from @/lib/supabase/client.
 */
export function createClient(): SupabaseClient<Database> | null {
  return createBrowserClient();
}
