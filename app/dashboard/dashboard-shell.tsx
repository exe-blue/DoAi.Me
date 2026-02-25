"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutDashboard,
  Server,
  Smartphone,
  Shield,
  Globe,
  Tv,
  Upload,
  ListOrdered,
  Zap,
  Terminal,
  Settings,
  FileText,
  AlertTriangle,
  LogOut,
  Wifi,
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
import useSWR from "swr";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const navGroups = [
  {
    label: "OVERVIEW",
    items: [
      { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
    ],
  },
  {
    label: "INFRASTRUCTURE",
    items: [
      { href: "/dashboard/workers", label: "PC 관리", icon: Server },
      { href: "/dashboard/devices", label: "디바이스", icon: Smartphone },
      { href: "/dashboard/proxies", label: "프록시", icon: Shield },
      { href: "/dashboard/network", label: "네트워크", icon: Globe },
    ],
  },
  {
    label: "CONTENT",
    items: [
      { href: "/dashboard/channels", label: "채널 관리", icon: Tv },
      { href: "/dashboard/content", label: "콘텐츠 등록", icon: Upload },
      { href: "/dashboard/tasks", label: "작업 / 대기열", icon: ListOrdered },
    ],
  },
  {
    label: "AUTOMATION",
    items: [
      { href: "/dashboard/presets", label: "프리셋", icon: Zap },
      { href: "/dashboard/adb", label: "ADB 콘솔", icon: Terminal },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/dashboard/settings", label: "설정", icon: Settings },
      { href: "/dashboard/logs", label: "로그", icon: FileText },
      { href: "/dashboard/errors", label: "에러", icon: AlertTriangle },
    ],
  },
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [systemOk, setSystemOk] = useState(true);

  const { data: workersData } = useSWR<{ workers: Array<{ id: string; pc_number?: string; hostname?: string; status: string; last_heartbeat: string | null }> }>(
    "/api/workers",
    (url) => fetch(url).then((r) => r.json()),
    { refreshInterval: 30_000 }
  );
  const workers = workersData?.workers ?? [];

  function pcStatus(lastHeartbeat: string | null): "online" | "stale" | "offline" {
    if (!lastHeartbeat) return "offline";
    const ageSec = Math.round((Date.now() - new Date(lastHeartbeat).getTime()) / 1000);
    if (ageSec < 90) return "online";
    if (ageSec < 300) return "stale";
    return "offline";
  }

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setSystemOk(d.status === "ok"))
      .catch(() => setSystemOk(false));
  }, []);

  const handleLogout = async () => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <SidebarProvider>
      <Sidebar className="border-r border-sidebar-border bg-sidebar">
        <SidebarHeader className="px-4 py-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
              <Image
                src="/images/logo.PNG"
                alt="DoAi.Me"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div>
              <span className="font-mono text-base font-bold text-sidebar-foreground">
                DoAi.Me
              </span>
              <span className="ml-1.5 font-mono text-[9px] tracking-[0.2em] text-primary">
                COMMAND CENTER
              </span>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2">
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className="px-3 text-[10px] font-medium tracking-[0.15em] text-muted-foreground">
                {group.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" &&
                        pathname.startsWith(item.href + "/"));
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={
                            isActive
                              ? "border-l-2 border-sidebar-ring bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span className="text-[13px]">{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <div
              className={`h-1.5 w-1.5 rounded-full ${systemOk ? "bg-status-success animate-pulse" : "bg-status-error"}`}
            />
            <span className="font-mono text-[10px] text-muted-foreground">
              {systemOk ? "System Nominal" : "Issues Detected"}
            </span>
          </div>
          {workers.length > 0 && (
            <div className="mb-2 space-y-1 px-1">
              {workers.map((w) => {
                const status = pcStatus(w.last_heartbeat);
                const label = w.pc_number ?? w.hostname ?? w.id.slice(0, 8);
                return (
                  <div key={w.id} className="flex items-center gap-1.5">
                    <div
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        status === "online"
                          ? "bg-status-success"
                          : status === "stale"
                            ? "bg-status-warning"
                            : "bg-status-error"
                      } ${status === "online" ? "animate-pulse" : ""}`}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground truncate">
                      {label} {status === "online" ? "online" : status === "stale" ? "stale" : "offline"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <SidebarSeparator />
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-sidebar-accent text-[10px] text-sidebar-accent-foreground">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-[11px] text-sidebar-foreground truncate max-w-[140px]">
                  {user?.email || "User"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="로그아웃"
              className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
          <SidebarTrigger className="text-foreground" />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
