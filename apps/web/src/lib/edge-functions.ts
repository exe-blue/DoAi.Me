import { createServerClientWithCookies } from "@/lib/supabase/server";

export async function invokeEdgeFunction<T = unknown>(name: string, body?: unknown): Promise<T> {
  const supabase = await createServerClientWithCookies();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;

  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (error) throw new Error(error.message || `${name} invoke failed`);
  return data as T;
}
