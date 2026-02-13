"use client";

import { useState, useEffect } from "react";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DevicesPage } from "@/components/devices-page";
import { ProxiesPage } from "@/components/proxies-page";
import { PresetsPage } from "@/components/presets-page";
import { TasksPage } from "@/components/tasks-page";
import { ChannelsPage } from "@/components/channels-page";
import { LogsPage } from "@/components/logs-page";
import { useWorkersStore } from "@/hooks/use-workers-store";
import { useTasksStore } from "@/hooks/use-tasks-store";
import { useChannelsStore } from "@/hooks/use-channels-store";
import { usePresetsStore } from "@/hooks/use-presets-store";
import { useLogsStore } from "@/hooks/use-logs-store";
import { useStatsStore } from "@/hooks/use-stats-store";

export default function RootPage() {
  const [activeTab, setActiveTab] = useState("devices");

  const { nodes, fetch: fetchWorkers } = useWorkersStore();
  const { tasks, fetch: fetchTasks } = useTasksStore();
  const { channels, contents, fetch: fetchChannels } = useChannelsStore();
  const { presets, fetch: fetchPresets } = usePresetsStore();
  const { logs, fetch: fetchLogs } = useLogsStore();
  const { stats, fetch: fetchStats } = useStatsStore();

  useEffect(() => {
    fetchWorkers();
    fetchTasks();
    fetchChannels();
    fetchPresets();
    fetchLogs();
    fetchStats();
  }, [fetchWorkers, fetchTasks, fetchChannels, fetchPresets, fetchLogs, fetchStats]);

  const nodeStatus = {
    connected: stats?.workers?.online ?? 0,
    total: stats?.workers?.total ?? 0,
  };

  const deviceStatus = {
    online: stats?.devices?.online ?? 0,
    running: stats?.devices?.running ?? 0,
    total: stats?.devices?.total ?? 0,
  };

  return (
    <SidebarProvider>
      <AppSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        nodeStatus={nodeStatus}
        deviceStatus={deviceStatus}
      />
      <SidebarInset className="p-4">
        {activeTab === "devices" && <DevicesPage nodes={nodes} />}
        {activeTab === "proxies" && <ProxiesPage nodes={nodes} />}
        {activeTab === "presets" && (
          <PresetsPage presets={presets} history={[]} nodes={nodes} />
        )}
        {activeTab === "tasks" && <TasksPage tasks={tasks} nodes={nodes} />}
        {activeTab === "channels" && (
          <ChannelsPage channels={channels} contents={contents} />
        )}
        {activeTab === "logs" && <LogsPage logs={logs} />}
      </SidebarInset>
    </SidebarProvider>
  );
}
