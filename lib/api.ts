import { toast } from "sonner";

/**
 * API 클라이언트 기반 — 모든 API 호출 공통 래퍼.
 * 응답 형식: { success, data?, error? }. 에러 시 toast (silent 옵션으로 비활성화 가능).
 *
 * 사용 예:
 *   // SWR
 *   const { data, error, isLoading } = useSWR('/api/dashboard/realtime', fetcher);
 *
 *   // 직접 호출 (POST, PATCH 등)
 *   const result = await apiClient.post('/api/tasks', { body: taskData });
 *   if (result.success) { ... }
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

    if (!res.ok) {
      const msg =
        json?.error ?? json?.message ?? `API error ${res.status}`;
      if (!silent) toast.error(msg);
      return { success: false, error: msg };
    }

    if (json && "success" in json) {
      return json as ApiResponse<T>;
    }

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
