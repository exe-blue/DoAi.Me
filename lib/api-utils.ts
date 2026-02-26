/**
 * API response format standard.
 * - Success: { ok: true, data }
 * - List: { ok: true, data: [...], page, pageSize, total }
 * - Error: { ok: false, code, message, details? }
 * All /api/* routes must use these helpers. Never expose Service Role key to client.
 */
import { NextResponse } from "next/server";

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiList<T> = { ok: true; data: T[]; page: number; pageSize: number; total: number };
export type ApiError = { ok: false; code: string; message: string; details?: unknown };

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, { status });
}

export function okList<T>(
  data: T[],
  opts: { page: number; pageSize: number; total: number },
  status = 200
): NextResponse<ApiList<T>> {
  return NextResponse.json(
    { ok: true as const, data, page: opts.page, pageSize: opts.pageSize, total: opts.total },
    { status }
  );
}

export function err(
  code: string,
  message: string,
  status = 400,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json(
    { ok: false as const, code, message, ...(details != null && { details }) },
    { status }
  );
}

export function errFrom(e: unknown, fallbackCode = "INTERNAL_ERROR", fallbackStatus = 500): NextResponse<ApiError> {
  const message = e instanceof Error ? e.message : String(e);
  const status = fallbackStatus;
  return NextResponse.json(
    { ok: false as const, code: fallbackCode, message },
    { status }
  );
}

/** Parse common query params (page, pageSize, sortBy, sortOrder, q). */
export function parseListParams(searchParams: URLSearchParams): {
  page: number;
  pageSize: number;
  sortBy: string | null;
  sortOrder: "asc" | "desc";
  q: string | null;
} {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
  const sortBy = searchParams.get("sortBy") || null;
  const order = searchParams.get("sortOrder")?.toLowerCase();
  const sortOrder = order === "asc" || order === "desc" ? order : "desc";
  const q = searchParams.get("q")?.trim() || null;
  return { page, pageSize, sortBy, sortOrder, q };
}
