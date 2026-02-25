/**
 * lib/api.ts — SWR fetch 래퍼 + API 유틸
 */

/** SWR용 fetcher (GET 전용) */
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `API error ${res.status}`);
  }
  const json = await res.json();
  return json.data ?? json;
}

/** POST/PATCH/DELETE 래퍼 */
export async function apiCall<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE" = "POST",
  body?: unknown
): Promise<{ success: boolean; data?: T; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}
