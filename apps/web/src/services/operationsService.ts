/**
 * Operations (ops) data — devices, KPIs, alerts, queue/slots (ops-queue-spec).
 * Uses existing APIs: /api/workers, /api/stats, /api/overview, /api/devices.
 * No new endpoints; stub+TODO where API does not exist.
 */
import { apiClient } from "@/lib/api";
import type {
  OperationsKpi,
  OperationsAlert,
  OperationsDeviceSummary,
  QueueSlotSummary,
  TimeoutFailedCounts,
  ActiveTaskSummary,
} from "./types";

const STATS_URL = "/api/stats";
const OVERVIEW_URL = "/api/overview";
const WORKERS_URL = "/api/workers";
const DEVICES_URL = "/api/devices";
const ERRORS_URL = "/api/dashboard/errors";

/** GET /api/stats exists — map to OperationsKpi (assumption). */
export async function getOperationsKpi(): Promise<OperationsKpi> {
  const res = await apiClient.get<{
    workers?: { total: number; online: number };
    devices?: {
      total: number;
      online: number;
      running?: number;
      offline: number;
      error: number;
    };
    tasks?: {
      completed?: number;
      failed?: number;
    };
  }>(STATS_URL);

  if (res.success && res.data) {
    const d = res.data.devices ?? {};
    const t = res.data.tasks ?? {};
    return {
      onlineDevices: d.online ?? 0,
      warningDevices: (d.offline ?? 0) + (d.error ?? 0),
      errorDevices: d.error ?? 0,
      lastHeartbeatAt: null, // TODO: assume API adds last_heartbeat summary when available
      recentSuccessCount: t.completed ?? 0,
      recentFailureCount: t.failed ?? 0,
    };
  }
  return {
    onlineDevices: 0,
    warningDevices: 0,
    errorDevices: 0,
    lastHeartbeatAt: null,
    recentSuccessCount: 0,
    recentFailureCount: 0,
  };
}

/** Alerts: use /api/dashboard/errors if present; else stub. */
export async function getOperationsAlerts(): Promise<OperationsAlert[]> {
  const res = await apiClient.get<{ data?: Array<{ type: string; count: number; lastOccurred: string; severity?: string }> }>(
    `${ERRORS_URL}?hours=24`
  );
  if (res.success && res.data && Array.isArray((res.data as any).data)) {
    const list = (res.data as any).data as Array<{ type: string; count: number; lastOccurred: string; severity?: string }>;
    return list.map((e, i) => ({
      id: `alert-${i}-${e.type}`,
      type: e.type,
      message: `${e.type} (${e.count})`,
      at: e.lastOccurred,
      severity: (e.severity === "fatal" ? "error" : "warning") as "warning" | "error",
    }));
  }
  // TODO: assume heartbeat mismatch / unauthorized endpoints if added later
  return [];
}

/** Workers + device counts from /api/workers. */
export async function getWorkersWithDevices(): Promise<OperationsDeviceSummary[]> {
  const res = await apiClient.get<{ workers?: Array<{
    id: string;
    pc_number?: string;
    hostname?: string;
    status?: string;
    last_heartbeat?: string | null;
    device_count?: number;
    online_count?: number;
  }> }>(WORKERS_URL);

  if (res.success && res.data && Array.isArray((res.data as any).workers)) {
    const workers = (res.data as any).workers as Array<{
      id: string;
      pc_number?: string;
      hostname?: string;
      status?: string;
      last_heartbeat?: string | null;
    }>;
    return workers.map((w) => ({
      id: w.id,
      pcNumber: w.pc_number ?? w.hostname ?? undefined,
      status: w.status ?? "offline",
      lastHeartbeat: w.last_heartbeat ?? null,
    }));
  }
  return [];
}

/** Device list with optional search (pc/serial/IP). Uses GET /api/devices. */
export async function getDevices(params: {
  q?: string;
  status?: string;
  worker_id?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ list: OperationsDeviceSummary[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.status) sp.set("status", params.status);
  if (params.worker_id) sp.set("worker_id", params.worker_id);
  if (params.page != null) sp.set("page", String(params.page));
  if (params.pageSize != null) sp.set("pageSize", String(params.pageSize));
  const res = await apiClient.get<{ data?: Array<{
    id: string;
    serial?: string;
    connection_id?: string;
    status?: string;
    last_seen?: string;
    worker_id?: string;
  }>; total?: number }>(`${DEVICES_URL}?${sp}`);

  if (res.success && res.data) {
    const raw = (res.data as any).data ?? (Array.isArray(res.data) ? res.data : []);
    const total = (res.data as any).total ?? raw.length;
    const list = (raw as any[]).map((d) => ({
      id: d.id,
      serial: d.serial ?? d.serial_number,
      ip: d.connection_id ?? d.ip_intranet,
      status: d.status ?? "offline",
      lastHeartbeat: d.last_seen ?? d.last_heartbeat ?? null,
    }));
    return { list, total };
  }
  return { list: [], total: 0 };
}

const SLOT_TARGET_MAX = 20;

/**
 * PC별 running_count / target / gap (ops-queue-spec §3).
 * 기존 API에 PC별 task_devices running count가 없어 stub 반환 + TODO.
 */
export async function getQueueSlotSummary(): Promise<QueueSlotSummary[]> {
  const res = await apiClient.get<{ workers?: Array<{
    id: string;
    pc_number?: string;
    hostname?: string;
    device_count?: number;
    online_count?: number;
    max_devices?: number;
  }> }>(WORKERS_URL);
  if (res.success && res.data && Array.isArray((res.data as any).workers)) {
    const workers = (res.data as any).workers as Array<{
      id: string;
      pc_number?: string;
      hostname?: string;
      device_count?: number;
      online_count?: number;
      max_devices?: number;
    }>;
    return workers.map((w) => {
      const eligible = w.online_count ?? w.device_count ?? 0;
      const target = Math.min(SLOT_TARGET_MAX, eligible);
      // TODO: API에 PC별 task_devices running count 없음. running_count는 0으로 표시하고 gap=target.
      const runningCount = 0;
      return {
        pcId: w.id,
        pcNumber: w.pc_number ?? w.hostname ?? w.id,
        runningCount,
        target,
        gap: Math.max(0, target - runningCount),
      };
    });
  }
  return [];
}

/**
 * 최근 N분 TIMEOUT / FAILED_FINAL 건수.
 * 기존 API 없음 → stub + TODO.
 */
export async function getTimeoutFailedCounts(sinceMinutes: number): Promise<TimeoutFailedCounts> {
  // TODO: task_devices 또는 task_logs에서 timeout/failed_final 집계 API 없음.
  return {
    timeoutCount: 0,
    failedFinalCount: 0,
    sinceMinutes,
  };
}

/**
 * Active task 개수 (tasks.status=running). 항상 0 또는 1이어야 함 (ops-queue-spec §2).
 * GET /api/stats 의 tasks.running 사용.
 */
export async function getActiveTaskSummary(): Promise<ActiveTaskSummary> {
  const res = await apiClient.get<{ tasks?: { running?: number } }>(STATS_URL);
  const running = res.success && res.data?.tasks ? (res.data.tasks.running ?? 0) : 0;
  return { activeCount: running, expectedMax: 1 };
}
