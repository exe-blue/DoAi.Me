"use client";

import {
  Monitor,
  Terminal,
  ListTodo,
  Tv,
  ScrollText,
  Smartphone,
  Settings,
  Wifi,
  WifiOff,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { id: "devices", label: "디바이스", icon: Monitor },
  { id: "presets", label: "명령 프리셋", icon: Terminal },
  { id: "tasks", label: "작업 관리", icon: ListTodo },
  { id: "channels", label: "채널 및 컨텐츠", icon: Tv },
  { id: "logs", label: "실행내역", icon: ScrollText },
];

interface AppSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  nodeStatus: { connected: number; total: number };
  deviceStatus: { online: number; running: number; total: number };
}

export function AppSidebar({
  activeTab,
  onTabChange,
  nodeStatus,
  deviceStatus,
}: AppSidebarProps) {
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Smartphone className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-sidebar-accent-foreground">
              DoAi.Me
            </h2>
            <p className="text-xs text-muted-foreground">Fleet Console</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>관제</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={activeTab === item.id}
                    onClick={() => onTabChange(item.id)}
                    tooltip={item.label}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>시스템 상태</SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="flex flex-col gap-3 px-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {nodeStatus.connected === nodeStatus.total ? (
                    <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  <span>노드 PC</span>
                </div>
                <Badge
                  variant="outline"
                  className="text-xs border-emerald-500/30 text-emerald-400"
                >
                  {nodeStatus.connected}/{nodeStatus.total}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  온라인 기기
                </span>
                <Badge
                  variant="outline"
                  className="text-xs border-emerald-500/30 text-emerald-400"
                >
                  {deviceStatus.online}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  실행 중 기기
                </span>
                <Badge
                  variant="outline"
                  className="text-xs border-amber-500/30 text-amber-400"
                >
                  {deviceStatus.running}
                </Badge>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  총 기기
                </span>
                <Badge variant="outline" className="text-xs">
                  {deviceStatus.total}
                </Badge>
              </div>
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="설정">
              <Settings className="h-4 w-4" />
              <span>설정</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="px-2 pb-2">
          <p className="text-[10px] text-muted-foreground">
            DoAi.Me Fleet Console v1.0
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
