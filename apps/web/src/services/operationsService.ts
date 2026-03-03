/**
 * Operations data from Supabase only (no HTTP API).
 * Use createBrowserClient() when called from client; server can use createServerClientWithCookies or createServiceRoleClient.
 */
import { createBrowserClient } from "@/lib/supabase/client";
import { getPendingPresetCommands, insertPresetCommand } from "@/lib/db/preset-commands";
import type {
  WorkerSummary,
  DeviceSummary,
  OperationsKpis,
  OperationsAlert,
  DashboardMetrics,
} from "./types";

const EMPTY_METRICS: DashboardMetrics = {
  onlineDevices: 0,
  warningDevices: 0,
  lastHeartbeatTime: null,
  recentSuccessCount: 0,
  recentFailureCount: 0,
};

export async function getWorkers(): Promise<WorkerSummary[]> {
  const supabase = createBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("v_worker_summary")
    .select("id, hostname, display_name, status, last_heartbeat, device_count, devices_online")
    .order("last_heartbeat", { ascending: false });

  if (error) return [];
  const rows = data ?? [];

  return rows.map((w: { id: string | null; hostname?: string | null; display_name?: string | null; status?: string | null; last_heartbeat?: string | null; device_count?: number | null; devices_online?: number | null }) => ({
    id: w.id ?? "",
    pc_number: (w.display_name ?? w.hostname ?? w.id ?? "").toString(),
    hostname: w.hostname ?? undefined,
    status: w.status ?? "offline",
    last_heartbeat: w.last_heartbeat ?? null,
    device_count: w.device_count ?? 0,
    online_count: w.devices_online ?? 0,
    max_devices: undefined,
  }));
}

export async function getDevices(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  pc_id?: string;
  q?: string;
}): Promise<{ data: DeviceSummary[]; total: number }> {
  const supabase = createBrowserClient();
  if (!supabase) return { data: [], total: 0 };

  let query = supabase
    .from("devices")
    .select("id, serial, status, worker_id, nickname, last_seen", { count: "exact" });

  if (params?.status) query = query.eq("status", params.status as "online" | "offline" | "busy" | "error");
  if (params?.pc_id) query = query.eq("worker_id", params.pc_id);
  if (params?.q?.trim()) {
    const q = params.q.trim();
    query = query.or(`serial.ilike.%${q}%,nickname.ilike.%${q}%`);
  }

  const pageSize = params?.pageSize ?? 50;
  const page = params?.page ?? 1;
  query = query.range((page - 1) * pageSize, page * pageSize - 1).order("last_seen", { ascending: false });

  const { data, error, count } = await query;

  if (error) return { data: [], total: 0 };
  const rows = data ?? [];

  const dataMapped: DeviceSummary[] = (rows as Array<{ id: string; serial?: string; status?: string | null; worker_id?: string | null; nickname?: string | null; last_seen?: string | null }>).map((d) => ({
    id: d.id,
    serial_number: d.serial,
    serial: d.serial,
    status: d.status ?? "offline",
    worker_id: d.worker_id ?? undefined,
    nickname: d.nickname ?? null,
    last_seen: d.last_seen ?? null,
  }));

  return { data: dataMapped, total: count ?? dataMapped.length };
}

/**
 * KPI from workers + devices (Supabase). recentSuccessCount/recentFailureCount from task_devices if available.
 */
export async function getKpis(): Promise<OperationsKpis> {
  const [workersRes, devicesRes] = await Promise.all([
    getWorkers(),
    getDevices({ pageSize: 1000 }),
  ]);

  let onlineDevices = 0;
  let warningDevices = 0;
  let lastHeartbeatTime: string | null = null;

  for (const w of workersRes) {
    onlineDevices += w.online_count ?? 0;
    if (w.status !== "online" && w.status !== "offline") warningDevices += 1;
    if (w.last_heartbeat) {
      if (!lastHeartbeatTime || w.last_heartbeat > lastHeartbeatTime) lastHeartbeatTime = w.last_heartbeat;
    }
  }

  for (const d of devicesRes.data) {
    if (d.status === "online") onlineDevices += 1;
    else if (d.status === "error" || d.status === "warning") warningDevices += 1;
  }

  const supabase = createBrowserClient();
  let recentSuccessCount = 0;
  let recentFailureCount = 0;
  if (supabase) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: doneCount } = await supabase.from("task_devices").select("id", { count: "exact", head: true }).eq("status", "done").gte("completed_at", since);
    const { count: failedCount } = await supabase.from("task_devices").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", since);
    recentSuccessCount = doneCount ?? 0;
    recentFailureCount = failedCount ?? 0;
  }

  return {
    onlineDevices,
    warningDevices,
    lastHeartbeatTime,
    recentSuccessCount,
    recentFailureCount,
  };
}

export async function getAlerts(): Promise<OperationsAlert[]> {
  const supabase = createBrowserClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("system_events")
    .select("id, event_type, message, severity, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return [];
  const rows = data ?? [];
  return rows.map((row: { id: string; event_type?: string; message?: string | null; severity?: string | null; created_at?: string | null }) => ({
    id: row.id,
    type: row.event_type ?? "event",
    message: row.message ?? "",
    severity: (row.severity === "error" ? "error" : "warning") as "warning" | "error",
    at: row.created_at ?? new Date().toISOString(),
  }));
}

export async function getDashboardMetricsSnapshot(): Promise<DashboardMetrics> {
  const kpis = await getKpis();
  return {
    onlineDevices: kpis.onlineDevices,
    warningDevices: kpis.warningDevices,
    lastHeartbeatTime: kpis.lastHeartbeatTime,
    recentSuccessCount: kpis.recentSuccessCount,
    recentFailureCount: kpis.recentFailureCount,
  };
}

export async function getPendingPresetCommandsList() {
  const supabase = createBrowserClient();
  if (!supabase) return [];
  return getPendingPresetCommands(supabase);
}

export async function queuePresetCommand(payload: { pc_id: string; preset: string; serial?: string | null }) {
  const supabase = createBrowserClient();
  if (!supabase) throw new Error("Supabase not configured");
  return insertPresetCommand(supabase, payload);
}
