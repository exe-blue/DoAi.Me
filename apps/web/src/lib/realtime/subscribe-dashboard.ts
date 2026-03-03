/**
 * Subscribe to room:dashboard and room:system for realtime KPIs and alerts.
 * Aggregates multiple worker snapshots into a single KPI view.
 */
import { createBrowserClient } from "@/lib/supabase/client";
import type { DashboardSnapshotPayload, SystemEventPayload } from "./types";
import type { OperationsKpis, OperationsAlert } from "@/services/types";

const CHANNEL_DASHBOARD = "room:dashboard";
const CHANNEL_SYSTEM = "room:system";

export interface DashboardSnapshotState {
  byWorker: Map<string, DashboardSnapshotPayload>;
  lastTimestamp: string | null;
}

/**
 * Aggregate worker snapshots into OperationsKpis (for Ops page).
 * Sums device counts, takes latest heartbeat, etc.
 */
export function aggregateSnapshotsToKpis(
  byWorker: Map<string, DashboardSnapshotPayload>
): Partial<OperationsKpis> {
  let onlineDevices = 0;
  let warningDevices = 0;
  let lastHeartbeatTime: string | null = null;

  for (const snap of byWorker.values()) {
    const worker = snap.worker;
    if (worker?.last_heartbeat) {
      if (!lastHeartbeatTime || worker.last_heartbeat > lastHeartbeatTime) {
        lastHeartbeatTime = worker.last_heartbeat;
      }
    }
    if (worker?.status && worker.status !== "online" && worker.status !== "offline") {
      warningDevices += 1;
    }
    const dev = snap.devices;
    if (typeof dev === "number") {
      onlineDevices += dev;
    } else if (dev && typeof dev === "object") {
      onlineDevices += (dev.online ?? 0) + (dev.busy ?? 0);
      warningDevices += (dev.error ?? 0) + (dev.warning ?? 0);
    }
  }

  return {
    onlineDevices,
    warningDevices,
    lastHeartbeatTime,
    recentSuccessCount: 0,
    recentFailureCount: 0,
  };
}

export type DashboardSnapshotCallback = (snapshot: DashboardSnapshotPayload) => void;
export type SystemEventCallback = (event: SystemEventPayload) => void;

export interface SubscribeDashboardOptions {
  onDashboardSnapshot: DashboardSnapshotCallback;
  onSystemEvent?: SystemEventCallback;
}

export interface RealtimeDashboardSubscription {
  unsubscribe: () => Promise<void>;
  getState: () => DashboardSnapshotState;
}

/**
 * Subscribe to room:dashboard (dashboard_snapshot) and optionally room:system (event).
 * Caller should aggregate snapshots (e.g. by worker id) and derive KPIs.
 */
export function subscribeDashboard(
  options: SubscribeDashboardOptions
): RealtimeDashboardSubscription | null {
  const supabase = createBrowserClient();
  if (!supabase) return null;

  const byWorker = new Map<string, DashboardSnapshotPayload>();
  let lastTimestamp: string | null = null;

  const dashboardChannel = supabase.channel(CHANNEL_DASHBOARD);
  dashboardChannel.on(
    "broadcast",
    { event: "dashboard_snapshot" },
    ({ payload }: { payload: DashboardSnapshotPayload }) => {
      const workerId = payload?.worker?.id;
      if (workerId) {
        byWorker.set(workerId, payload);
        if (payload.timestamp) lastTimestamp = payload.timestamp;
      }
      options.onDashboardSnapshot(payload);
    }
  );
  dashboardChannel.subscribe(() => {});

  let systemChannel: ReturnType<typeof supabase.channel> | null = null;
  if (options.onSystemEvent) {
    systemChannel = supabase.channel(CHANNEL_SYSTEM);
    systemChannel.on(
      "broadcast",
      { event: "event" },
      ({ payload }: { payload: SystemEventPayload }) => {
        options.onSystemEvent?.(payload);
      }
    );
    systemChannel.subscribe(() => {});
  }

  return {
    async unsubscribe() {
      await supabase.removeChannel(dashboardChannel);
      if (systemChannel) await supabase.removeChannel(systemChannel);
    },
    getState: () => ({ byWorker, lastTimestamp }),
  };
}

/**
 * Convert a system event payload to an OperationsAlert for the alerts list.
 */
export function systemEventToAlert(payload: SystemEventPayload): OperationsAlert {
  const id = `sys-${payload.timestamp ?? Date.now()}-${payload.event_type ?? "event"}`;
  const severity: "warning" | "error" =
    (payload.details as { severity?: "warning" | "error" })?.severity ?? "warning";
  return {
    id,
    type: "recent_failures",
    message: payload.message ?? "",
    severity,
    at: payload.timestamp ?? new Date().toISOString(),
  };
}
