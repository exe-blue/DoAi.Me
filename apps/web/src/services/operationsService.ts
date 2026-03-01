import { apiClient } from "@/lib/api";
import type {
  WorkerSummary,
  DeviceSummary,
  OperationsKpis,
  OperationsAlert,
} from "./types";

/** Raw workers API response: { workers: [...] } */
interface WorkersResponse {
  workers?: Array<{
    id: string;
    pc_number?: string;
    hostname?: string;
    status?: string;
    last_heartbeat?: string | null;
    device_count?: number;
    online_count?: number;
    max_devices?: number;
  }>;
}

/** Devices list API returns { ok, data, page, pageSize, total }. */
interface DevicesListResponse {
  ok?: boolean;
  data?: DeviceSummary[];
  page?: number;
  pageSize?: number;
  total?: number;
}

export async function getWorkers(): Promise<WorkerSummary[]> {
  const res = await apiClient.get<WorkersResponse>("/api/workers", { silent: true });
  if (!res.success || !res.data?.workers) return [];
  return res.data.workers.map((w) => ({
    id: w.id,
    pc_number: w.pc_number ?? w.hostname ?? w.id,
    hostname: w.hostname,
    status: w.status ?? "offline",
    last_heartbeat: w.last_heartbeat ?? null,
    device_count: w.device_count ?? 0,
    online_count: w.online_count ?? 0,
    max_devices: w.max_devices,
  }));
}

export async function getDevices(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  pc_id?: string;
  q?: string;
}): Promise<{ data: DeviceSummary[]; total: number }> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.pageSize != null) search.set("pageSize", String(params.pageSize));
  if (params?.status) search.set("status", params.status);
  if (params?.pc_id) search.set("pc_id", params.pc_id);
  if (params?.q) search.set("q", params.q);
  const qs = search.toString();
  const url = qs ? `/api/devices?${qs}` : "/api/devices";
  const res = await apiClient.get<DevicesListResponse>(url, { silent: true });
  if (!res.success) return { data: [], total: 0 };
  const body = res.data as { data?: DeviceSummary[]; total?: number } | DeviceSummary[];
  const data = Array.isArray(body) ? body : (body?.data ?? []);
  const total = Array.isArray(body) ? body.length : (body?.total ?? data.length);
  return { data, total };
}

/**
 * KPI: online/warning counts from workers+devices; rest stub + TODO.
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
      if (!lastHeartbeatTime || w.last_heartbeat > lastHeartbeatTime) {
        lastHeartbeatTime = w.last_heartbeat;
      }
    }
  }
  for (const d of devicesRes.data) {
    if (d.status === "error" || d.status === "warning") warningDevices += 1;
  }
  // TODO: recentSuccessCount, recentFailureCount — API 없음, stub.
  return {
    onlineDevices,
    warningDevices,
    lastHeartbeatTime,
    recentSuccessCount: 0,
    recentFailureCount: 0,
  };
}

/**
 * Alerts: no API. Stub + TODO.
 */
export async function getAlerts(): Promise<OperationsAlert[]> {
  // TODO: heartbeat_mismatch, unauthorized, recent_failures — API 없음.
  return [];
}
