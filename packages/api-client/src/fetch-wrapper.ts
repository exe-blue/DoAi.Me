/**
 * Minimal fetch wrapper for typed API calls.
 * TODO: Add axios variant if needed; keep fetch as default.
 */

export interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: Record<string, unknown> | unknown[];
}

export interface ApiResponse<T = unknown> {
  data?: T;
  ok: boolean;
  status: number;
}

async function request<T>(
  url: string,
  options: FetchOptions = {}
): Promise<ApiResponse<T>> {
  const { body, ...init } = options;
  const res = await fetch(url, {
    ...init,
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    },
  });
  const data = res.ok ? (await res.json().catch(() => undefined)) as T : undefined;
  return { data, ok: res.ok, status: res.status };
}

export function createApiClient(baseUrl: string) {
  return {
    get<T>(path: string, init?: RequestInit) {
      return request<T>(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, { ...init, method: "GET" });
    },
    post<T>(path: string, body?: FetchOptions["body"], init?: RequestInit) {
      return request<T>(`${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`, { ...init, method: "POST", body });
    },
  };
}

export function get<T>(url: string, init?: RequestInit) {
  return request<T>(url, { ...init, method: "GET" });
}

export function post<T>(url: string, body?: FetchOptions["body"], init?: RequestInit) {
  return request<T>(url, { method: "POST", body, ...init });
}
