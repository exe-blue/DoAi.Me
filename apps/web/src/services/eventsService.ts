/**
 * Events/logs from Supabase only (task_logs, execution_logs). No HTTP API.
 */
import { createBrowserClient } from "@/lib/supabase/client";
import type { EventLogEntry, EventLogDetail } from "./types";

function mapTaskLogRow(row: Record<string, unknown>): EventLogEntry {
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
  worker_id?: string;
  level?: string;
  limit?: number;
  search?: string;
}): Promise<EventLogEntry[]> {
  const supabase = createBrowserClient();
  if (!supabase) return [];

  let query = supabase
    .from("task_logs")
    .select("*")
    .order("created_at", { ascending: false });

  if (params?.task_id) query = query.eq("task_id", params.task_id);
  if (params?.device_id) query = query.eq("device_serial", params.device_id);
  if (params?.worker_id) query = query.eq("worker_id", params.worker_id);
  if (params?.level) query = query.eq("level", params.level as "debug" | "info" | "warn" | "error" | "fatal");
  const limit = params?.limit ?? 100;
  query = query.limit(limit);

  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => mapTaskLogRow(row as Record<string, unknown>));
}

export async function getErrors(params?: {
  hours?: number;
  level?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: EventLogEntry[]; total: number }> {
  const supabase = createBrowserClient();
  if (!supabase) return { data: [], total: 0 };

  let query = supabase
    .from("task_logs")
    .select("*", { count: "exact" })
    .eq("level", "error")
    .order("created_at", { ascending: false });

  if (params?.hours != null) {
    const since = new Date(Date.now() - params.hours * 60 * 60 * 1000).toISOString();
    query = query.gte("created_at", since);
  }
  const pageSize = params?.pageSize ?? 50;
  const page = params?.page ?? 1;
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) return { data: [], total: 0 };
  const rows = data ?? [];
  return {
    data: rows.map((row) => mapTaskLogRow(row as Record<string, unknown>)),
    total: count ?? rows.length,
  };
}

export async function getLogDetail(id: string): Promise<EventLogDetail | null> {
  const supabase = createBrowserClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("task_logs")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    task_id: row.task_id != null ? String(row.task_id) : undefined,
    device_serial: row.device_serial != null ? String(row.device_serial) : undefined,
    level: String(row.level ?? "info"),
    message: String(row.message ?? ""),
    created_at: String(row.created_at ?? ""),
    raw: row as Record<string, unknown>,
  };
}
