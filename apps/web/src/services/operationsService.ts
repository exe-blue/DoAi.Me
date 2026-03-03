import { apiClient } from "@/lib/api";
import type { OperationsAlert, OperationsKpis, DashboardMetrics } from "./types";

interface DashboardRealtimeResponse {
  success?: boolean;
  data?: DashboardMetrics;
}

const EMPTY_METRICS: DashboardMetrics = {
  key: "global",
  devices_total: 0,
  devices_online: 0,
  devices_busy: 0,
  devices_offline: 0,
  devices_error: 0,
  workers_total: 0,
  workers_online: 0,
  workers_error: 0,
  last_worker_heartbeat: null,
  worker_heartbeat_stale: 0,
  error_count_24h: 0,
  updated_at: null,
};

export async function getDashboardMetricsSnapshot(): Promise<DashboardMetrics> {
  const res = await apiClient.get<DashboardRealtimeResponse>("/api/dashboard/realtime", { silent: true });
  if (!res.success || !res.data?.data) return EMPTY_METRICS;
  return { ...EMPTY_METRICS, ...res.data.data };
}

export function metricsToKpis(metrics: DashboardMetrics): OperationsKpis {
  return {
    onlineDevices: metrics.devices_online + metrics.devices_busy,
    warningDevices: metrics.devices_error + metrics.worker_heartbeat_stale + metrics.workers_error,
    lastHeartbeatTime: metrics.last_worker_heartbeat,
    recentSuccessCount: 0,
    recentFailureCount: metrics.error_count_24h,
  };
}

export async function getKpis(): Promise<OperationsKpis> {
  const metrics = await getDashboardMetricsSnapshot();
  return metricsToKpis(metrics);
}

export function metricsToAlerts(metrics: DashboardMetrics): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];
  const at = metrics.updated_at ?? new Date().toISOString();

  if (metrics.worker_heartbeat_stale > 0) {
    alerts.push({
      id: "worker-heartbeat-stale",
      type: "heartbeat_mismatch",
      message: `Heartbeat stale workers: ${metrics.worker_heartbeat_stale}`,
      severity: "warning",
      at,
    });
  }

  if (metrics.workers_error > 0) {
    alerts.push({
      id: "worker-error",
      type: "recent_failures",
      message: `Workers in error status: ${metrics.workers_error}`,
      severity: "error",
      at,
    });
  }

  if (metrics.error_count_24h > 0) {
    alerts.push({
      id: "recent-failures",
      type: "recent_failures",
      message: `Task log errors(24h): ${metrics.error_count_24h}`,
      severity: "error",
      at,
    });
  }

  return alerts;
}

export async function getAlerts(): Promise<OperationsAlert[]> {
  const metrics = await getDashboardMetricsSnapshot();
  return metricsToAlerts(metrics);
}
