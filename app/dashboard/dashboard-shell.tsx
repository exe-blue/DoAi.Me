"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Server,
  Smartphone,
  Shield,
  Globe,
  Tv,
  Upload,
  ListOrdered,
  CheckCircle,
  Zap,
  Terminal,
  FileText,
  AlertTriangle,
  Settings,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const navGroups = [
  {
    label: "",
    items: [
      { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
      { href: "/dashboard/workers", label: "PC", icon: Server },
      { href: "/dashboard/devices", label: "디바이스", icon: Smartphone },
      { href: "/dashboard/network", label: "네트워크", icon: Globe },
      { href: "/dashboard/proxies", label: "프록시", icon: Shield },
    ],
  },
  {
    label: "",
    items: [
      { href: "/dashboard/channels", label: "채널", icon: Tv },
      { href: "/dashboard/content", label: "콘텐츠", icon: Upload },
      { href: "/dashboard/tasks", label: "대기열", icon: ListOrdered },
      { href: "/dashboard/completed", label: "완료", icon: CheckCircle },
    ],
  },
  {
    label: "",
    items: [
      { href: "/dashboard/tasks", label: "작업관리", icon: ListOrdered },
      { href: "/dashboard/presets", label: "명령모듈", icon: Zap },
      { href: "/dashboard/adb", label: "ADB콘솔", icon: Terminal },
    ],
  },
  {
    label: "",
    items: [
      { href: "/dashboard/logs", label: "로그", icon: FileText },
      { href: "/dashboard/errors", label: "에러", icon: AlertTriangle },
      { href: "/dashboard/settings", label: "설정", icon: Settings },
    ],
  },
];

const ROUTE_LABELS: Record<string,string> = {
  "/dashboard":"OVERVIEW", "/dashboard/workers":"PC", "/dashboard/devices":"DEVICES",
  "/dashboard/network":"NETWORK", "/dashboard/proxies":"PROXIES",
  "/dashboard/channels":"CHANNELS", "/dashboard/content":"CONTENT",
  "/dashboard/tasks":"QUEUE", "/dashboard/completed":"COMPLETED",
  "/dashboard/presets":"PRESETS", "/dashboard/adb":"ADB CONSOLE",
  "/dashboard/logs":"LOGS", "/dashboard/errors":"ERRORS", "/dashboard/settings":"SETTINGS",
};

function BreadcrumbLabel() {
  const pathname = usePathname();
  const label = ROUTE_LABELS[pathname] || pathname.split("/").pop()?.toUpperCase() || "";
  return <span className="text-[10px] font-mono font-bold tracking-wider text-amber-500">{label}</span>;
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [systemOk, setSystemOk] = useState(true);

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
      <Sidebar className="border-r border-[#1e2130] bg-[#0f1117]">
        <SidebarHeader className="px-4 py-5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <Wifi className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-mono text-base font-bold text-white">
                DoAi.Me
              </span>
              <span className="ml-1.5 font-mono text-[9px] tracking-[0.2em] text-blue-400">
                COMMAND CENTER
              </span>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2">
          {navGroups.map((group, gi) => (
            <SidebarGroup key={gi}>
              {group.label ? (
                <SidebarGroupLabel className="px-3 text-[10px] font-medium tracking-[0.15em] text-slate-500">
                  {group.label}
                </SidebarGroupLabel>
              ) : gi > 0 ? (
                <SidebarSeparator className="my-2" />
              ) : null}
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
                              ? "border-l-2 border-blue-500 bg-[#1a1d2e] text-white"
                              : "text-slate-400 hover:text-slate-200"
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

        <SidebarFooter className="border-t border-[#1e2130] px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <div
              className={`h-1.5 w-1.5 rounded-full ${systemOk ? "bg-green-500 animate-pulse" : "bg-red-500"}`}
            />
            <span className="font-mono text-[10px] text-slate-500">
              {systemOk ? "System Nominal" : "Issues Detected"}
            </span>
          </div>
          <SidebarSeparator />
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-[#1a1d2e] text-[10px] text-slate-300">
                  {user?.email?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-[11px] text-slate-300 truncate max-w-[140px]">
                  {user?.email || "User"}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded p-1 text-slate-500 hover:bg-[#1a1d2e] hover:text-slate-300"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="bg-[#0a0a0f]">
        <header className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b border-[#1e2130] bg-[#0a0a0f]/90 px-4 backdrop-blur-sm">
          <SidebarTrigger className="text-slate-400" />
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-600">TACTICAL COMMAND</span>
          <span className="text-[10px] text-slate-700">/</span>
          <BreadcrumbLabel />
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
