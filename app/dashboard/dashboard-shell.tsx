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
  LogOut,
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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

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

function UserMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading || !user) return null;

  const email = user.email ?? "";
  const displayName = (user.user_metadata?.name ?? email) || "U";
  const initials = displayName
    .toString()
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Avatar className="h-8 w-8">
        {user.user_metadata?.avatar_url && (
          <AvatarImage src={user.user_metadata.avatar_url} alt={email} />
        )}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {user.user_metadata?.name ?? email}
        </p>
        {email && (
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        )}
      </div>
      <form action="/auth/logout" method="post" className="inline">
        <button
          type="submit"
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          aria-label="로그아웃"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

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
        <UserMenu />
        <div className="px-2 pb-2 space-y-1">
          <p className="text-[11px] text-muted-foreground">
            DoAi.Me Fleet Console v1.0
          </p>
          <div className="flex gap-2 text-[11px]">
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground transition-colors">개인정보 취급방침</Link>
            <span className="text-muted-foreground">·</span>
            <Link href="/agreement" className="text-muted-foreground hover:text-foreground transition-colors">서비스 약관</Link>
          </div>
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

export function DashboardShell({ children }: { children: React.ReactNode }) {
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
