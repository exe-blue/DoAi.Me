"use client";

import { useEffect } from "react";
import { useDashboardStore } from "@/hooks/use-dashboard-store";
import { useShallow } from "zustand/react/shallow";
import { useRealtimeInit } from "@/hooks/use-realtime-manager";
import { createClient } from "@/lib/supabase/client";
import { HealthBar } from "@/components/overview/health-bar";
import { StatCards } from "@/components/overview/stat-cards";
import { WorkerDetail } from "@/components/overview/worker-detail";
import { ActivityFeed } from "@/components/overview/activity-feed";
import { HealthReportPanel } from "@/components/overview/health-report";
export default function DashboardOverviewPage() {
  const { worker, devices, tasks, proxies, events, fetchInitial } = useDashboardStore();

  // Select action functions with useShallow so their references stay stable across re-renders
  const { updateFromSnapshot, addEvent } = useDashboardStore(
    useShallow((state) => ({
      updateFromSnapshot: state.updateFromSnapshot,
      addEvent: state.addEvent,
    }))
  );

  // Initialize realtime connection
  useRealtimeInit();

  // Fetch initial data on mount
  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Subscribe to realtime updates
  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    // Subscribe to dashboard snapshots
    const dashboardChannel = supabase
      .channel("room:dashboard")
      .on("broadcast", { event: "dashboard_snapshot" }, ({ payload }) => {
        console.log("[Dashboard] Snapshot received:", payload);
        updateFromSnapshot(payload);
      })
      .subscribe((status: string, err?: Error) => {
        if (err) {
          console.error("[Dashboard] dashboard channel error:", err);
        } else {
          console.log("[Dashboard] dashboard channel status:", status);
        }
      });

    // Subscribe to system events
    const systemChannel = supabase
      .channel("room:system")
      .on("broadcast", { event: "event" }, ({ payload }) => {
        console.log("[Dashboard] System event received:", payload);
        addEvent(payload);
      })
      .subscribe((status: string, err?: Error) => {
        if (err) {
          console.error("[Dashboard] system channel error:", err);
        } else {
          console.log("[Dashboard] system channel status:", status);
        }
      });

    return () => {
      supabase.removeChannel(dashboardChannel);
      supabase.removeChannel(systemChannel);
    };
  }, [updateFromSnapshot, addEvent]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">개요 대시보드</h1>
        <p className="text-base text-muted-foreground">
          시스템 전체 상태를 한눈에 확인합니다.
        </p>
      </div>

      {/* Zone A: Health Bar */}
      <HealthBar devices={devices} />

      {/* Zone B: Stat Cards */}
      <StatCards worker={worker} devices={devices} tasks={tasks} proxies={proxies} />

      {/* Zone C & D: Two columns on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Zone C: Worker Detail */}
        <WorkerDetail worker={worker} devices={devices} />

        {/* Zone D: Activity Feed */}
        <ActivityFeed events={events} />
      </div>

      {/* Zone E: Health Report */}
      <HealthReportPanel />
    </div>
  );
}
