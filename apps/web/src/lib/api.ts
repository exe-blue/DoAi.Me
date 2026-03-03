import { toast } from "sonner";

/**
 * API: WebSocket only (no HTTP). HTTP /api/* routes have been removed.
 * Response code: 10000 = success, 10001 = failure.
 * This module is for future WS-based client: parse payload.code (10000/10001) and map to success/error.
 * See docs/API_WS_ONLY.md and src/lib/ws-api-response.ts.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Suppress automatic error toast (default: false) */
  silent?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(
  url: string,
  method: HttpMethod,
  opts: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { body, headers, silent } = opts;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => null);
    const code = json?.code as number | undefined;
    if (code === 10001) {
      const msg = json?.message ?? json?.error ?? "API error";
      if (!silent) toast.error(msg);
      return { success: false, error: msg };
    }
    if (!res.ok) {
      const msg = json?.message ?? json?.error ?? `API error ${res.status}`;
      if (!silent) toast.error(msg);
      return { success: false, error: msg };
    }
    if (code === 10000 && "data" in json) return { success: true, data: json.data as T };
    if (json && "success" in json) return json as ApiResponse<T>;
    return { success: true, data: (json?.data ?? json) as T };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    if (!silent) toast.error(msg);
    return { success: false, error: msg };
  }
}

// ---------------------------------------------------------------------------
// SWR fetcher
// ---------------------------------------------------------------------------

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);

  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(json.error ?? `API error ${res.status}`, res.status);
  }

  const json = await res.json();
  return (json.data ?? json) as T;
}

// ---------------------------------------------------------------------------
// apiClient — convenience object for mutation calls
// ---------------------------------------------------------------------------

export const apiClient = {
  get<T = unknown>(url: string, opts?: RequestOptions) {
    return request<T>(url, "GET", opts);
  },
  post<T = unknown>(url: string, opts?: RequestOptions) {
    return request<T>(url, "POST", opts);
  },
  patch<T = unknown>(url: string, opts?: RequestOptions) {
    return request<T>(url, "PATCH", opts);
  },
  put<T = unknown>(url: string, opts?: RequestOptions) {
    return request<T>(url, "PUT", opts);
  },
  delete<T = unknown>(url: string, opts?: RequestOptions) {
    return request<T>(url, "DELETE", opts);
  },
} as const;
