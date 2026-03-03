"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRealtimePostgresChanges } from "./use-realtime-postgres-changes";
import type { DashboardMetrics, OperationsAlert, OperationsKpis } from "@/services/types";
import {
  getDashboardMetricsSnapshot,
  metricsToAlerts,
  metricsToKpis,
} from "@/services/operationsService";

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

export function useDashboardMetricsRealtime() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetchSnapshot = useCallback(async () => {
    try {
      const snapshot = await getDashboardMetricsSnapshot();
      setMetrics(snapshot);
      setError(null);
    } catch (err) {
      // API failed, preserve current metrics and show error
      setError(err instanceof Error ? err.message : "Failed to refresh metrics");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const snapshot = await getDashboardMetricsSnapshot();
        if (!cancelled) {
          setMetrics(snapshot);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load initial metrics");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRealtimeChange = useCallback(() => {
    // Refetch but don't await - errors are handled inside refetchSnapshot
    refetchSnapshot();
  }, [refetchSnapshot]);

  const { isConnected, attempt } = useRealtimePostgresChanges({
    channel: "dashboard-metrics",
    table: "dashboard_metrics",
    filter: "key=eq.global",
    onChange: handleRealtimeChange,
  });

  const kpis: OperationsKpis = useMemo(() => metricsToKpis(metrics), [metrics]);
  const alerts: OperationsAlert[] = useMemo(() => metricsToAlerts(metrics), [metrics]);

  return { metrics, kpis, alerts, loading, error, isConnected, reconnectAttempt: attempt };
}
