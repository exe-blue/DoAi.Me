"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Server,
  Smartphone,
  Shield,
  Tv,
  ListTodo,
  Settings,
  Terminal,
  ScrollText,
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
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useEffect, useState } from "react";
import { ConnectionStatus } from "@/components/connection-status";

const navItems = [
  { href: "/dashboard", label: "개요", icon: LayoutDashboard },
  { href: "/dashboard/workers", label: "워커", icon: Server },
  { href: "/dashboard/devices", label: "디바이스", icon: Smartphone },
  { href: "/dashboard/proxies", label: "프록시 설정", icon: Shield },
  { href: "/dashboard/channels", label: "채널", icon: Tv },
  { href: "/dashboard/tasks", label: "작업 관리", icon: ListTodo },
  { href: "/dashboard/settings", label: "설정", icon: Settings },
  { href: "/dashboard/adb", label: "ADB 콘솔", icon: Terminal },
  { href: "/dashboard/logs", label: "로그", icon: ScrollText },
];

function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
            <Smartphone className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-sidebar-accent-foreground">
              YouTube Agent Farm
            </h2>
            <p className="text-sm text-muted-foreground">Fleet Console</p>
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
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.label}
                  >
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="px-2 pb-2">
          <p className="text-[11px] text-muted-foreground">
            DoAi.Me Fleet Console v1.0
          </p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function TopBar() {
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(
        new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-14 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-3">
        <SidebarTrigger />
        <h1 className="text-lg font-semibold">YouTube Agent Farm</h1>
      </div>
      <div className="flex items-center gap-4">
        <ConnectionStatus />
        <div className="text-sm font-mono text-muted-foreground">
          {currentTime}
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <TopBar />
        <div className="p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
