"use client";

import useSWR, { type SWRConfiguration, type KeyedMutator } from "swr";

/** Standard API response: success { ok: true, data } or list { ok: true, data, page, pageSize, total } or error { ok: false, code, message }. */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: true; data: T[]; page: number; pageSize: number; total: number }
  | { ok: false; code: string; message: string };

const fetcher = async (url: string): Promise<ApiResponse<unknown>> => {
  const base = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const full = url.startsWith("http") ? url : `${base}${url}`;
  const res = await fetch(full);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json as { message?: string })?.message ?? (json as { error?: string })?.error ?? res.statusText;
    throw new Error(msg);
  }
  if (json && (json as { ok?: boolean }).ok === false) {
    throw new Error((json as { message?: string }).message ?? (json as { code?: string }).code ?? "Request failed");
  }
  return json as ApiResponse<unknown>;
};

/** Unwrap data from standard response. For list responses, returns { list, page, pageSize, total }. */
function unwrap<T>(raw: ApiResponse<T> | undefined): T | undefined {
  if (!raw || !(raw as { ok?: boolean }).ok) return undefined;
  return (raw as { data: T }).data;
}

function unwrapList<TItem>(raw: ApiResponse<TItem[]> | undefined): { list: TItem[]; page: number; pageSize: number; total: number } | undefined {
  if (!raw || !(raw as { ok?: boolean }).ok) return undefined;
  const r = raw as { data: TItem[]; page?: number; pageSize?: number; total?: number };
  return {
    list: Array.isArray(r.data) ? r.data : [],
    page: r.page ?? 1,
    pageSize: r.pageSize ?? 20,
    total: r.total ?? 0,
  };
}

export function useApi<T = unknown>(
  url: string | null,
  config?: SWRConfiguration<ApiResponse<T>>
): {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<ApiResponse<T>>;
  raw: ApiResponse<T> | undefined;
} {
  const { data: raw, error, isLoading, mutate } = useSWR<ApiResponse<T>>(url, fetcher as any, {
    revalidateOnFocus: false,
    ...config,
  });
  const data = unwrap(raw);
  return { data, error, isLoading, mutate, raw };
}

/** For list endpoints returning { ok: true, data: T[], page, pageSize, total }. */
export function useListApi<T = unknown>(
  url: string | null,
  config?: SWRConfiguration<ApiResponse<T[]>>
): {
  list: T[];
  page: number;
  pageSize: number;
  total: number;
  error: Error | undefined;
  isLoading: boolean;
  mutate: KeyedMutator<ApiResponse<T[]>>;
} {
  const { data: raw, error, isLoading, mutate } = useSWR<ApiResponse<T[]>>(url, fetcher as any, {
    revalidateOnFocus: false,
    ...config,
  });
  const unwrapped = unwrapList(raw);
  return {
    list: unwrapped?.list ?? [],
    page: unwrapped?.page ?? 1,
    pageSize: unwrapped?.pageSize ?? 20,
    total: unwrapped?.total ?? 0,
    error,
    isLoading,
    mutate,
  };
}
