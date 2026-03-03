"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  subscribeDashboard,
  aggregateSnapshotsToKpis,
  systemEventToAlert,
} from "@/lib/realtime";
import type { DashboardSnapshotPayload } from "@/lib/realtime/types";
import type { OperationsKpis, OperationsAlert } from "@/services/types";

export interface UseRealtimeDashboardOptions {
  /** Called when aggregated KPIs change (from dashboard_snapshot). */
  onKpis?: (kpis: Partial<OperationsKpis>) => void;
  /** Called when a system event arrives (e.g. device_offline, device_recovered). */
  onAlert?: (alert: OperationsAlert) => void;
}

/**
 * Subscribe to room:dashboard and room:system. Aggregates worker snapshots into KPIs
 * and optionally converts system events to alerts.
 */
export function useRealtimeDashboard(options: UseRealtimeDashboardOptions = {}) {
  const { onKpis, onAlert } = options;
  const byWorkerRef = useRef<Map<string, DashboardSnapshotPayload>>(new Map());
  const [error, setError] = useState<Error | null>(null);
  const subRef = useRef<ReturnType<typeof subscribeDashboard> | null>(null);

  const handleSnapshot = useCallback(
    (payload: DashboardSnapshotPayload) => {
      const workerId = payload?.worker?.id;
      if (!workerId) return;
      byWorkerRef.current.set(workerId, payload);
      const byWorker = new Map(byWorkerRef.current);
      const kpis = aggregateSnapshotsToKpis(byWorker);
      onKpis?.(kpis);
    },
    [onKpis]
  );

  const handleSystemEvent = useCallback(
    (payload: { message?: string; event_type?: string; details?: Record<string, unknown>; timestamp?: string }) => {
      const alert = systemEventToAlert(payload);
      onAlert?.(alert);
    },
    [onAlert]
  );

  useEffect(() => {
    const sub = subscribeDashboard({
      onDashboardSnapshot: handleSnapshot,
      onSystemEvent: onAlert ? handleSystemEvent : undefined,
    });
    subRef.current = sub;
    return () => {
      sub?.unsubscribe().catch((err) => setError(err instanceof Error ? err : new Error(String(err))));
      subRef.current = null;
    };
  }, [handleSnapshot, handleSystemEvent, onAlert]);

  return { error };
}
