"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  PanelLeft,
  Calendar,
  GitBranch,
  FileCode,
  Users,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: null,
    items: [
      { href: "/dashboard", label: "대시보드", icon: LayoutDashboard },
    ],
  },
  {
    label: "INFRASTRUCTURE",
    items: [
      { href: "/infrastructure/pcs", label: "PC 관리", icon: Server },
      { href: "/infrastructure/devices", label: "디바이스", icon: Smartphone },
      { href: "/infrastructure/proxies", label: "프록시", icon: Shield },
      { href: "/infrastructure/network", label: "네트워크", icon: Globe },
    ],
  },
  {
    label: "CONTENT",
    items: [
      { href: "/content/channels", label: "채널 관리", icon: Tv },
      { href: "/content/content", label: "콘텐츠 등록", icon: Upload },
      { href: "/content/tasks", label: "작업 / 대기열", icon: ListOrdered },
      { href: "/content/schedules", label: "스케줄", icon: Calendar },
    ],
  },
  {
    label: "AUTOMATION",
    items: [
      { href: "/automation/presets", label: "프리셋", icon: Zap },
      { href: "/automation/adb", label: "ADB 콘솔", icon: Terminal },
      { href: "/automation/workflows", label: "워크플로우", icon: GitBranch },
      { href: "/automation/scripts", label: "스크립트", icon: FileCode },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { href: "/system/settings", label: "설정", icon: Settings },
      { href: "/system/logs", label: "로그", icon: FileText },
      { href: "/system/errors", label: "에러", icon: AlertTriangle },
      { href: "/system/accounts", label: "계정", icon: Users },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
          <PanelLeft className="h-5 w-5" />
          DoAi.Me
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <SidebarGroup key={group.label ?? "main"}>
            {group.label && (
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.href}
                      className={cn(pathname === item.href && "bg-sidebar-accent")}
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
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t p-2" />
    </Sidebar>
  );
}

export function AppSidebarLayout({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
