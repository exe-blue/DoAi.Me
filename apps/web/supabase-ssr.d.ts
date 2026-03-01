/**
 * Type declaration for @supabase/ssr when the package's types are not resolved
 * (e.g. with moduleResolution: "bundler"). The package ships types in dist/main/;
 * this file ensures the module is recognized. At runtime the real package is used.
 */
declare module "@supabase/ssr" {
  import type {
    SupabaseClient,
    SupabaseClientOptions,
  } from "@supabase/supabase-js";

  interface CookieMethodsServer {
    getAll(): Promise<{ name: string; value: string }[]>;
    setAll(
      cookies: { name: string; value: string; options?: object }[],
    ): void | Promise<void>;
  }

  export function createServerClient<Database = unknown>(
    supabaseUrl: string,
    supabaseKey: string,
    options: SupabaseClientOptions<string> & { cookies: CookieMethodsServer },
  ): SupabaseClient<Database>;

  export function createBrowserClient<Database = unknown>(
    supabaseUrl: string,
    supabaseKey: string,
    options?: SupabaseClientOptions<string>,
  ): SupabaseClient<Database>;
}
