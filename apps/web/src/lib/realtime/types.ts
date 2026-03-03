/**
 * Realtime broadcast payload types (aligned with agent dashboard-broadcaster and heartbeat).
 */

export interface DashboardSnapshotWorker {
  id: string;
  name?: string;
  status?: string;
  uptime_seconds?: number;
  last_heartbeat?: string;
}

export interface DashboardSnapshotPayload {
  type?: string;
  worker?: DashboardSnapshotWorker;
  devices?: Record<string, number> | number;
  tasks?: Record<string, number> | number;
  proxies?: Record<string, number> | number;
  timestamp?: string;
}

export interface DevicesUpdatePayload {
  worker_id: string;
  devices: Array<{
    serial: string;
    status?: string;
    model?: string;
    battery?: number | null;
  }>;
}

export interface SystemEventPayload {
  type?: string;
  event_type?: string;
  message?: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}
