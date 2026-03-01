/**
 * Assumption-only types for dashboard UI. No DB/schema guarantee.
 * Real data shape is behind service adapters (existing API or stub+TODO).
 */

export interface OperationsKpi {
  onlineDevices: number;
  warningDevices: number;
  /** Device status=error (eligible 제외, FAILED_FINAL 추론 가능 시) */
  errorDevices: number;
  lastHeartbeatAt: string | null;
  recentSuccessCount: number;
  recentFailureCount: number;
}

export interface OperationsAlert {
  id: string;
  type: string;
  message: string;
  at: string;
  severity: "info" | "warning" | "error";
}

export interface OperationsDeviceSummary {
  id: string;
  pcNumber?: string;
  serial?: string;
  ip?: string;
  status: string;
  lastHeartbeat?: string | null;
}

export interface YoutubeChannel {
  id: string;
  name: string;
  handle?: string | null;
  lastCollectedAt?: string | null;
  status?: string | null;
  isMonitored?: boolean;
  videoCount?: number;
}

export interface YoutubeContent {
  id: string;
  title: string;
  channelId: string;
  channelName?: string;
  status?: string;
  thumbnailUrl?: string | null;
}

/** Catalog event types (spec). Anything else is Unknown. */
export const EVENT_TYPES = [
  "heartbeat",
  "inventory",
  "diff",
  "sync",
  "anomaly",
  "unknown",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface EventLogItem {
  id: string;
  level: string;
  message: string;
  created_at: string;
  task_id?: string | null;
  device_serial?: string | null;
  raw?: Record<string, unknown>;
  /** Resolved from raw or message; "unknown" if undefined. */
  eventType: EventType | "unknown";
  /** True if eventType is unknown or payload is non-standard. */
  isUndefined: boolean;
}

export interface SettingsItem {
  key: string;
  value: unknown;
  description?: string | null;
  updated_at?: string | null;
}

/** PC별 슬롯 요약 (ops-queue-spec). 기존 API 없으면 stub+TODO. */
export interface QueueSlotSummary {
  pcId: string;
  pcNumber: string;
  runningCount: number;
  target: number;
  gap: number;
}

/** TIMEOUT/FAILED_FINAL 카운트 (최근 N분). 기존 API 없으면 stub+TODO. */
export interface TimeoutFailedCounts {
  timeoutCount: number;
  failedFinalCount: number;
  sinceMinutes: number;
}

/** Active task는 1개만 (tasks.status=running). */
export interface ActiveTaskSummary {
  activeCount: number;
  expectedMax: 1;
}
