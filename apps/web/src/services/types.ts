/**
 * Service-layer assumption types.
 * Field names are assumptions; API/DB may differ. See DASHBOARD_ASSUMPTIONS_AND_TODOS.md.
 */

// --- Operations ---
export interface WorkerSummary {
  id: string;
  pc_number: string;
  hostname?: string;
  status: string;
  last_heartbeat: string | null;
  device_count: number;
  online_count: number;
  max_devices?: number;
}

export interface DeviceSummary {
  id: string;
  serial_number?: string;
  serial?: string;
  connection_id?: string;
  status: string;
  worker_id?: string;
  nickname?: string | null;
  last_seen?: string | null;
}

/** Assumption: KPI fields not all from current API; some stub. */
export interface OperationsKpis {
  onlineDevices: number;
  warningDevices: number;
  /** Assumption: last heartbeat time (e.g. most recent across workers). */
  lastHeartbeatTime: string | null;
  /** Assumption: recent success count. TODO: API 없음 → stub. */
  recentSuccessCount: number;
  /** Assumption: recent failure count. TODO: API 없음 → stub. */
  recentFailureCount: number;
}

/** Assumption: alert types. TODO: API 없음 → stub. */
export interface OperationsAlert {
  id: string;
  type: "heartbeat_mismatch" | "unauthorized" | "recent_failures";
  message: string;
  severity: "warning" | "error";
  at: string;
}

// --- YouTube ---
export interface ChannelSummary {
  id: string;
  name: string;
  handle?: string | null;
  profile_url?: string | null;
  thumbnail_url?: string | null;
  subscriber_count?: string | number;
  video_count?: number;
  is_monitored?: boolean;
  /** Assumption: last collected at. Use if API provides. */
  last_collected_at?: string | null;
  /** Assumption: collection status. TODO: 없으면 stub. */
  collection_status?: string;
}

export interface ContentSummary {
  id: string;
  title?: string;
  channel_id?: string;
  channel_name?: string;
  thumbnail_url?: string | null;
  duration_sec?: number;
  status?: string;
  /** Assumption: watch/collect related. */
  watch_duration_sec?: number;
  created_at?: string;
  updated_at?: string;
}

// --- Events / Logs ---
export interface EventLogEntry {
  id?: string;
  task_id?: string;
  device_serial?: string;
  level: string;
  message: string;
  created_at: string;
  /** Assumption: raw payload for detail view. */
  raw?: Record<string, unknown>;
}

export interface EventLogDetail {
  id: string;
  task_id?: string;
  device_serial?: string;
  level: string;
  message: string;
  created_at: string;
  raw: Record<string, unknown>;
}
