"use client";

import { useState, useEffect, useMemo } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { DevicesPage } from "@/components/devices-page";
import { PresetsPage } from "@/components/presets-page";
import { TasksPage } from "@/components/tasks-page";
import { ChannelsPage } from "@/components/channels-page";
import { LogsPage } from "@/components/logs-page";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useWorkersWithRealtime } from "@/hooks/use-workers-store";
import { useTasksWithRealtime } from "@/hooks/use-tasks-store";
import { useChannelsStore } from "@/hooks/use-channels-store";
import { usePresetsStore } from "@/hooks/use-presets-store";
import { useLogsWithRealtime } from "@/hooks/use-logs-store";
import { useStatsStore } from "@/hooks/use-stats-store";

const TAB_LABELS: Record<string, string> = {
  devices: "디바이스",
  presets: "명령 프리셋",
  tasks: "작업 관리",
  channels: "채널 및 컨텐츠",
  logs: "실행내역",
};

export default function Page() {
  const [activeTab, setActiveTab] = useState("devices");

  // Use Realtime-enabled hooks
  const { nodes, fetch: fetchWorkers } = useWorkersWithRealtime();
  const { tasks, fetch: fetchTasks } = useTasksWithRealtime();
  const { logs, fetch: fetchLogs } = useLogsWithRealtime();

  // These don't have Realtime yet
  const { channels, contents, fetch: fetchChannels } = useChannelsStore();
  const { presets, fetch: fetchPresets } = usePresetsStore();
  const { stats, fetch: fetchStats } = useStatsStore();

  useEffect(() => {
    fetchWorkers();
    fetchStats();
  }, [fetchWorkers, fetchStats]);

  useEffect(() => {
    if (activeTab === "tasks") fetchTasks();
    if (activeTab === "channels") fetchChannels();
    if (activeTab === "presets") fetchPresets();
    if (activeTab === "logs") fetchLogs();
  }, [activeTab, fetchTasks, fetchChannels, fetchPresets, fetchLogs]);

  const nodeStatus = useMemo(
    () => ({
      connected: stats?.workers.online ?? nodes.filter((n) => n.status === "connected").length,
      total: stats?.workers.total ?? nodes.length,
    }),
    [stats, nodes],
  );

  const deviceStatus = useMemo(() => {
    if (stats) {
      return {
        online: stats.devices.online,
        running: stats.devices.running,
        total: stats.devices.total,
      };
    }
    const s = { online: 0, running: 0, total: 0 };
    for (const n of nodes) {
      for (const d of n.devices) {
        if (d.status === "online") s.online++;
        if (d.status === "running") s.running++;
        s.total++;
      }
    }
    return s;
  }, [stats, nodes]);

  return (
    <SidebarProvider>
      <AppSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        nodeStatus={nodeStatus}
        deviceStatus={deviceStatus}
      />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-4" />
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold text-foreground">
              {TAB_LABELS[activeTab]}
            </span>
            <div className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-muted-foreground">LIVE</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
              {stats
                ? `Workers: ${stats.workers.online}/${stats.workers.total} 연결됨`
                : `Workers: ${nodeStatus.connected}/${nodeStatus.total} 연결됨`}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4">
          {activeTab === "devices" && <DevicesPage nodes={nodes} />}
          {activeTab === "presets" && (
            <PresetsPage
              presets={presets}
              history={[]}
              nodes={nodes}
            />
          )}
          {activeTab === "tasks" && (
            <TasksPage tasks={tasks} nodes={nodes} />
          )}
          {activeTab === "channels" && (
            <ChannelsPage channels={channels} contents={contents} />
          )}
          {activeTab === "logs" && <LogsPage logs={logs} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
