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
    const snapshot = await getDashboardMetricsSnapshot();
    // Only update metrics if we got valid data (not EMPTY_METRICS from API failure)
    // Check if the snapshot has actual data by comparing updated_at
    if (snapshot.updated_at !== null) {
      setMetrics(snapshot);
      setError(null);
    } else {
      // API failed and returned EMPTY_METRICS, preserve current metrics
      setError("Failed to refresh metrics");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const snapshot = await getDashboardMetricsSnapshot();
      if (!cancelled) {
        setMetrics(snapshot);
        setLoading(false);
        // Set error if initial load failed
        if (snapshot.updated_at === null) {
          setError("Failed to load initial metrics");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRealtimeChange = useCallback(() => {
    refetchSnapshot().catch((err) => {
      setError(err instanceof Error ? err.message : "Failed to refresh metrics");
    });
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
