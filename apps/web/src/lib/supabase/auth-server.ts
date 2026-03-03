import {
  createServerClientWithCookies,
  isSupabaseConfiguredServer,
} from "./server";

export { isSupabaseConfiguredServer };

/**
 * @deprecated Use createServerClientWithCookies() from @/lib/supabase/server.
 */
export async function createAuthServerClient() {
  return createServerClientWithCookies();
}
