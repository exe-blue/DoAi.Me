"use client";

import { useState, useMemo } from "react";
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
import {
  mockNodes,
  mockPresets,
  mockCommandHistory,
  mockTasks,
  mockChannels,
  mockContents,
  mockLogs,
} from "@/lib/mock-data";

const TAB_LABELS: Record<string, string> = {
  devices: "디바이스",
  presets: "명령 프리셋",
  tasks: "작업 관리",
  channels: "채널 및 컨텐츠",
  logs: "실행내역",
};

export default function Page() {
  const [activeTab, setActiveTab] = useState("devices");

  const nodeStatus = useMemo(
    () => ({
      connected: mockNodes.filter((n) => n.status === "connected").length,
      total: mockNodes.length,
    }),
    [],
  );

  const deviceStatus = useMemo(() => {
    const s = { online: 0, running: 0, total: 0 };
    for (const n of mockNodes) {
      for (const d of n.devices) {
        if (d.status === "online") s.online++;
        if (d.status === "running") s.running++;
        s.total++;
      }
    }
    return s;
  }, []);

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
              WebSocket: 5/5 연결됨
            </span>
          </div>
        </header>

        <main className="flex-1 p-4">
          {activeTab === "devices" && <DevicesPage nodes={mockNodes} />}
          {activeTab === "presets" && (
            <PresetsPage
              presets={mockPresets}
              history={mockCommandHistory}
              nodes={mockNodes}
            />
          )}
          {activeTab === "tasks" && (
            <TasksPage tasks={mockTasks} nodes={mockNodes} />
          )}
          {activeTab === "channels" && (
            <ChannelsPage channels={mockChannels} contents={mockContents} />
          )}
          {activeTab === "logs" && <LogsPage logs={mockLogs} />}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
