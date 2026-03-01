/**
 * Events / logs. Uses existing GET /api/logs and GET /api/dashboard/errors.
 * No new endpoints; assumption types only. Unknown/Undefined handled per undefined-registry.md.
 */
import { apiClient } from "@/lib/api";
import type { EventLogItem, EventType } from "./types";
import { EVENT_TYPES } from "./types";

const LOGS_URL = "/api/logs";
const ERRORS_URL = "/api/dashboard/errors";

const CATALOG_SET = new Set<string>(EVENT_TYPES);

export interface EventsFilters {
  task_id?: string;
  device_id?: string;
  level?: string;
  search?: string;
  before?: string;
  limit?: number;
  /** Event type filter (client-side if API does not support). */
  eventType?: EventType | "";
  /** Include events with unknown type / non-standard payload. Default true. */
  includeUndefined?: boolean;
  /** Start of time range (client-side filter). */
  timeStart?: string;
  /** End of time range (client-side filter). */
  timeEnd?: string;
}

function inferEventType(row: Record<string, unknown>): EventType | "unknown" {
  const rawType = row.event_type ?? row.eventType ?? row.type;
  if (typeof rawType === "string" && CATALOG_SET.has(rawType)) {
    return rawType as EventType;
  }
  const msg = (row.message ?? "") as string;
  const m = msg.toLowerCase();
  if (m.includes("heartbeat")) return "heartbeat";
  if (m.includes("inventory")) return "inventory";
  if (m.includes("diff")) return "diff";
  if (m.includes("sync")) return "sync";
  if (m.includes("anomaly")) return "anomaly";
  return "unknown";
}

function isPayloadNonStandard(row: Record<string, unknown>): boolean {
  return !row.message && !row.level && Object.keys(row).length <= 2;
}

/**
 * GET /api/logs — task_logs list. Maps to EventLogItem with eventType and isUndefined.
 * When API returns empty, returns stub + TODO (no new data creation).
 */
export async function getEventLogs(filters: EventsFilters = {}): Promise<EventLogItem[]> {
  const sp = new URLSearchParams();
  if (filters.task_id) sp.set("task_id", filters.task_id);
  if (filters.device_id) sp.set("device_id", filters.device_id);
  if (filters.level) sp.set("level", filters.level);
  if (filters.search) sp.set("search", filters.search);
  if (filters.before) sp.set("before", filters.before);
  if (filters.limit != null) sp.set("limit", String(filters.limit));

  const res = await apiClient.get<{ logs?: unknown[] }>(`${LOGS_URL}?${sp}`);

  let list: unknown[] = [];
  if (res.success && res.data) {
    list = (res.data as any).logs ?? (Array.isArray(res.data) ? res.data : []);
  }

  if (list.length === 0) {
    // TODO: remove stub when /api/logs reliably returns data; do not create new data source.
    list = [];
  }

  const includeUndefined = filters.includeUndefined !== false;
  const timeStart = filters.timeStart ? new Date(filters.timeStart).getTime() : Number.NaN;
  const timeEnd = filters.timeEnd ? new Date(filters.timeEnd).getTime() : Number.NaN;
  const eventTypeFilter = filters.eventType?.trim() || null;

  const mapped: EventLogItem[] = (list as any[]).map((row) => {
    const eventType = inferEventType(row as Record<string, unknown>);
    const payloadUndefined = isPayloadNonStandard(row as Record<string, unknown>);
    const isUndefined = eventType === "unknown" || payloadUndefined;
    return {
      id: row.id ?? `${row.created_at}-${(row.message ?? "").toString().slice(0, 8)}`,
      level: (row.level ?? "info") as string,
      message: (row.message ?? "") as string,
      created_at: (row.created_at ?? new Date().toISOString()) as string,
      task_id: row.task_id ?? null,
      device_serial: row.device_serial ?? null,
      raw: row as Record<string, unknown>,
      eventType,
      isUndefined,
    };
  });

  let out = mapped;
  if (!includeUndefined) {
    out = out.filter((e) => !e.isUndefined);
  }
  if (eventTypeFilter) {
    out = out.filter((e) => e.eventType === eventTypeFilter);
  }
  if (!Number.isNaN(timeStart)) {
    out = out.filter((e) => new Date(e.created_at).getTime() >= timeStart);
  }
  if (!Number.isNaN(timeEnd)) {
    out = out.filter((e) => new Date(e.created_at).getTime() <= timeEnd);
  }

  return out;
}

/** GET /api/dashboard/errors — aggregated errors (type, count, lastOccurred). */
export async function getErrorSummary(params: {
  hours?: number;
  level?: string;
  q?: string;
}): Promise<{
  items: Array<{ type: string; count: number; severity: string; lastOccurred: string }>;
  total: number;
}> {
  const sp = new URLSearchParams();
  if (params.hours != null) sp.set("hours", String(params.hours));
  if (params.level) sp.set("level", params.level);
  if (params.q) sp.set("q", params.q);
  const res = await apiClient.get<{
    data?: Array<{ type: string; count: number; severity: string; lastOccurred: string }>;
    total?: number;
  }>(`${ERRORS_URL}?${sp}`);
  if (res.success && res.data) {
    const data = (res.data as any).data ?? [];
    const total = (res.data as any).total ?? data.length;
    return { items: data, total };
  }
  return { items: [], total: 0 };
}
