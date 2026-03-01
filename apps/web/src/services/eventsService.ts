import { apiClient } from "@/lib/api";
import type { EventLogEntry, EventLogDetail } from "./types";

/** GET /api/logs returns { logs: [...] }. */
interface LogsApiResponse {
  logs?: Array<Record<string, unknown>>;
}

/** GET /api/dashboard/errors returns okList: { ok, data, page, pageSize, total }. */
interface ErrorsApiResponse {
  data?: Array<{ type?: string; count?: number; severity?: string; lastOccurred?: string }>;
  total?: number;
}

function mapLogRow(row: Record<string, unknown>): EventLogEntry {
  return {
    id: row.id != null ? String(row.id) : undefined,
    task_id: row.task_id != null ? String(row.task_id) : undefined,
    device_serial: row.device_serial != null ? String(row.device_serial) : undefined,
    level: String(row.level ?? "info"),
    message: String(row.message ?? ""),
    created_at: String(row.created_at ?? ""),
    raw: row as Record<string, unknown>,
  };
}

export async function getLogs(params?: {
  task_id?: string;
  device_id?: string;
  level?: string;
  limit?: number;
  search?: string;
}): Promise<EventLogEntry[]> {
  const search = new URLSearchParams();
  if (params?.task_id) search.set("task_id", params.task_id);
  if (params?.device_id) search.set("device_id", params.device_id);
  if (params?.level) search.set("level", params.level);
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.search) search.set("search", params.search);
  const qs = search.toString();
  const url = qs ? `/api/logs?${qs}` : "/api/logs";
  const res = await apiClient.get<LogsApiResponse>(url, { silent: true });
  if (!res.success) return [];
  const logs = (res.data as LogsApiResponse)?.logs ?? [];
  return (logs as Record<string, unknown>[]).map(mapLogRow);
}

export async function getErrors(params?: {
  hours?: number;
  level?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: EventLogEntry[]; total: number }> {
  const search = new URLSearchParams();
  if (params?.hours != null) search.set("hours", String(params.hours));
  if (params?.level) search.set("level", params.level);
  if (params?.q) search.set("q", params.q);
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.pageSize != null) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  const url = qs ? `/api/dashboard/errors?${qs}` : "/api/dashboard/errors";
  const res = await apiClient.get<ErrorsApiResponse>(url, { silent: true });
  if (!res.success) return { data: [], total: 0 };
  const body = res.data as { data?: Array<Record<string, unknown>>; total?: number } | undefined;
  const data = body?.data ?? [];
  const total = body?.total ?? data.length;
  const mapped = data.map((row) =>
    mapLogRow({
      ...row,
      message: row.type ?? row.message ?? "",
      level: (row.severity as string) ?? "error",
      created_at: row.lastOccurred ?? row.created_at,
    })
  );
  return { data: mapped, total };
}

/**
 * Single log entry detail. No single-log API → stub + TODO.
 */
export async function getLogDetail(id: string): Promise<EventLogDetail | null> {
  // TODO: 단건 조회 API 없음 — stub. When API exists, call e.g. GET /api/logs?id=...
  const logs = await getLogs({ limit: 1 });
  const entry = logs.find((e) => e.id === id || e.task_id === id);
  if (entry)
    return {
      id: entry.id ?? id,
      task_id: entry.task_id,
      device_serial: entry.device_serial,
      level: entry.level,
      message: entry.message,
      created_at: entry.created_at,
      raw: entry.raw ?? {},
    };
  return null;
}
