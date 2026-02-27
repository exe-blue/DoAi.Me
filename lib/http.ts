/**
 * Fetch wrapper for API calls. Base URL from window (client) or env.
 */
const getBase = () =>
  typeof window !== "undefined"
    ? ""
    : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function http<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<{ data?: T; error?: string; status: number }> {
  const base = getBase();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        error: (json?.error ?? json?.message ?? res.statusText) || "Request failed",
        status: res.status,
      };
    }
    return { data: (json?.data ?? json) as T, status: res.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { error: message, status: 0 };
  }
}
