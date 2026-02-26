"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import {
  Activity, TrendingUp, TrendingDown, Server, RefreshCw,
  Wifi, AlertTriangle,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher } from "@/lib/api";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RealtimeData {
  totalDevices: number;
  online: number;
  offline: number;
  busy: number;
  error: number;
  activeMissions: number;
  todayStats: { views: number; errors: number; likes?: number; comments?: number };
  pcs: Array<{ pc_number: string; status: string; id: string }>;
  timestamp?: string;
}

interface WorkerData {
  id: string;
  hostname?: string;
  pc_number?: string;
  status: string;
  device_count?: number;
  online_count?: number;
}

interface OverviewData {
  worker: { id: string; name: string; status: string } | null;
  devices: { total: number; online: number; busy: number; error: number; offline: number };
  tasks: { running: number; pending: number; completed_today: number; failed_today: number };
  proxies: { total: number; valid: number; invalid: number; unassigned: number };
  timestamp: string;
}

interface ErrorEntry {
  type: string;
  count: number;
  severity: string;
  lastOccurred: string;
}

interface ErrorsData {
  hours: number;
  totalErrors: number;
  errors: ErrorEntry[];
}

interface HealthData {
  status: string;
}

interface TaskListItem {
  id: string;
  status?: string;
  title?: string;
  createdAt?: string;
  completedAt?: string;
  source?: "manual" | "channel_auto" | null;
  priority?: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function ErrorBlock({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="h-5 w-5 text-destructive" />
      <span className="text-xs text-destructive">{message ?? "Failed to load"}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI Card
// ---------------------------------------------------------------------------

function KPICard({ label, value, trend, suffix, loading }: {
  label: string; value: string | number; trend: "up" | "down" | "neutral"; suffix?: string; loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <Skeleton className="mb-2 h-10 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border bg-card p-5 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-end gap-2">
          <span className="font-mono text-4xl font-bold text-foreground">{value}</span>
          {suffix && <span className="mb-1 font-mono text-lg text-muted-foreground">{suffix}</span>}
          <div className="mb-1.5 ml-auto">
            {trend === "up" && <TrendingUp className="h-6 w-6 text-status-success animate-bounce" style={{ animationDuration: "2s" }} />}
            {trend === "down" && <TrendingDown className="h-6 w-6 text-status-error animate-bounce" style={{ animationDuration: "2s" }} />}
            {trend === "neutral" && <Activity className="h-6 w-6 text-status-info" />}
          </div>
        </div>
        <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle, hsl(var(--primary)) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity Chart
// ---------------------------------------------------------------------------

function useCurrentHour() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => {
      setHour((prev) => {
        const h = new Date().getHours();
        return h !== prev ? h : prev;
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  return hour;
}

function ActivityChart({ data, loading }: { data: RealtimeData | null; loading: boolean }) {
  const [tab, setTab] = useState("TODAY");
  const currentHour = useCurrentHour();

  const chartData = useMemo(() => buildChartData(data), [data?.todayStats?.views, data?.todayStats?.errors, currentHour]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <Skeleton className="h-[220px] w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {["TODAY", "WEEK", "MONTH"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-3 py-1 text-[10px] font-bold tracking-wider transition-colors",
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-4 text-[10px]">
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-status-success" /> 시청</span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-status-info" /> 좋아요</span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-status-warning" /> 댓글</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--status-success))" stopOpacity={0.2} />
              <stop offset="100%" stopColor="hsl(var(--status-success))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
          <XAxis dataKey="hour" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45}
            tickFormatter={(v: number) => v >= 1000 ? (v / 1000) + "K" : String(v)} />
          <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontFamily: "monospace", fontSize: 11 }} />
          <Area type="monotone" dataKey="views" stroke="hsl(var(--status-success))" fill="url(#gViews)" strokeWidth={2} />
          <Area type="monotone" dataKey="likes" stroke="hsl(var(--status-info))" fill="transparent" strokeWidth={1.5} />
          <Area type="monotone" dataKey="comments" stroke="hsl(var(--status-warning))" fill="transparent" strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Build 24h chart from realtime API (todayStats only; no per-hour from API yet). */
function buildChartData(data: RealtimeData | null) {
  const now = new Date();
  const viewsToday = data?.todayStats?.views ?? 0;
  const errorsToday = data?.todayStats?.errors ?? 0;
  const currentHour = now.getHours();
  return Array.from({ length: 24 }, (_, h) => {
    const isCurrentHour = h === currentHour;
    return {
      hour: String(h).padStart(2, "0") + ":00",
      views: isCurrentHour ? viewsToday : 0,
      likes: 0,
      comments: isCurrentHour ? errorsToday : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// PC Ranking
// ---------------------------------------------------------------------------

function PCRanking({ workers, loading, error, onRetry }: {
  workers: WorkerData[]; loading: boolean; error?: Error; onRetry?: () => void;
}) {
  if (error) return <ErrorBlock message={error.message} onRetry={onRetry} />;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  const sorted = [...workers].sort((a, b) => (b.online_count ?? 0) - (a.online_count ?? 0));

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-status-success" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">PC RANKING</span>
        <span className="rounded bg-status-success/20 px-1.5 py-0.5 text-[9px] font-bold text-status-success">
          {workers.filter(w => w.status === "online").length} ONLINE
        </span>
      </div>
      <div className="space-y-2">
        {sorted.map((w, i) => {
          const name = w.pc_number ?? w.hostname ?? "PC??";
          const online = w.online_count ?? 0;
          const total = w.device_count ?? 0;
          const pct = total > 0 ? Math.round((online / total) * 100) : 0;
          const isOnline = w.status === "online";
          return (
            <div key={w.id} className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2.5">
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold",
                i === 0 ? "bg-status-warning/20 text-status-warning" : "bg-muted text-muted-foreground"
              )}>
                {i + 1}
              </span>
              <div className={cn("h-2 w-2 rounded-full", isOnline ? "bg-status-success" : "bg-muted-foreground")} />
              <span className="font-mono text-sm font-bold text-foreground">{name}</span>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-border">
                  <div className="h-1.5 rounded-full bg-status-success/80 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
              <span className="font-mono text-[10px] text-muted-foreground">{online}/{total}</span>
            </div>
          );
        })}
        {workers.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">연결된 PC 없음</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device Status Panel
// ---------------------------------------------------------------------------

function SecurityStatus({ data, loading }: { data: RealtimeData | null; loading: boolean }) {
  const online = data?.online ?? 0;
  const total = data?.totalDevices ?? 0;
  const survivalRate = total > 0 ? Math.round((online / total) * 100) : 0;
  const tasks = data?.activeMissions ?? 0;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="col-span-2 h-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 relative overflow-hidden">
      <div className="mb-4 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-status-success" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">DEVICE STATUS</span>
        <span className="rounded bg-status-success/20 px-1.5 py-0.5 text-[9px] font-bold text-status-success">ONLINE</span>
      </div>
      <div className="relative z-10 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-status-success/30 bg-status-success/5 p-3">
          <div className="text-[10px] font-bold text-status-success">ONLINE DEVICES</div>
          <div className="font-mono text-2xl font-bold text-status-success">{online}/{total}</div>
          <div className="text-[9px] text-status-success/60">[CONNECTED]</div>
        </div>
        <div className="rounded-lg border border-status-success/30 bg-status-success/5 p-3">
          <div className="text-[10px] font-bold text-status-success">SURVIVAL RATE</div>
          <div className="font-mono text-2xl font-bold text-status-success">{survivalRate}%</div>
          <div className="text-[9px] text-status-success/60">[STABLE]</div>
        </div>
        <div className="col-span-2 rounded-lg border border-status-info/30 bg-status-info/5 p-3">
          <div className="text-[10px] font-bold text-status-info">REMAINING TASKS</div>
          <div className="font-mono text-2xl font-bold text-status-info">{tasks}</div>
          <div className="text-[9px] text-status-info/60">[IN QUEUE]</div>
        </div>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/images/robot-wireframe.gif" alt="" className="absolute -right-4 -bottom-4 h-40 w-40 opacity-20 pointer-events-none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recent Tasks — GET /api/tasks?limit=5 (client slice)
// ---------------------------------------------------------------------------

function RecentTasks({ tasks, loading, error, onRetry }: {
  tasks: TaskListItem[];
  loading: boolean;
  error?: Error;
  onRetry?: () => void;
}) {
  if (error) return <ErrorBlock message={error.message} onRetry={onRetry} />;
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  const list = tasks.slice(0, 5);
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-status-info" />
        <span className="text-xs font-bold uppercase tracking-wider text-foreground">RECENT TASKS</span>
      </div>
      <div className="space-y-2">
        {list.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">No tasks</p>
        ) : (
          list.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className={cn(
                  "font-mono text-[11px] text-foreground truncate",
                  t.source === "manual" && "font-semibold"
                )} title={t.id}>
                  {t.title || t.id.slice(0, 8)}
                </span>
                {t.source === "manual" && (
                  <span className="shrink-0 rounded bg-blue-500/20 px-1 py-0.5 text-[8px] font-medium text-blue-400">직접</span>
                )}
                {t.source === "channel_auto" && (
                  <span className="shrink-0 rounded bg-green-500/20 px-1 py-0.5 text-[8px] font-medium text-green-400">자동</span>
                )}
              </div>
              <span className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                t.status === "completed" || t.status === "done" ? "bg-status-success/20 text-status-success" :
                t.status === "failed" ? "bg-status-error/20 text-status-error" :
                "bg-muted text-muted-foreground"
              )}>
                {t.status ?? "—"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right Panel (notifications + clock)
// ---------------------------------------------------------------------------

function RightPanel({ data, health }: {
  data: RealtimeData | null;
  health: HealthData | undefined;
}) {
  const [time, setTime] = useState<Date | null>(null);

  const { data: errorsData } = useSWR<ErrorsData>(
    "/api/dashboard/errors?hours=24",
    fetcher,
    { refreshInterval: 30_000 }
  );

  useEffect(() => {
    setTime(new Date());
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const systemOk = health?.status === "ok";

  const logs: Array<{ type: string; title: string; desc: string; time: string; color: string }> = [];

  if (errorsData?.errors?.length) {
    for (const e of errorsData.errors.slice(0, 5)) {
      logs.push({
        type: "error",
        title: (e.type ?? "error").toUpperCase(),
        desc: `${e.count ?? 0}건 발생`,
        time: e.lastOccurred ? new Date(e.lastOccurred).toLocaleTimeString("ko-KR") : "",
        color: "bg-status-error",
      });
    }
  }

  const viewsToday = data?.todayStats?.views ?? 0;
  logs.push({
    type: "success",
    title: "TODAY VIEWS",
    desc: viewsToday === 0 ? "No data yet" : `${viewsToday}건 시청 완료`,
    time: "today",
    color: "bg-status-success",
  });

  return (
    <div className="w-80 shrink-0 border-l border-border bg-background p-5 hidden xl:flex flex-col overflow-y-auto">
      {/* Clock */}
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {time ? time.toLocaleDateString("ko-KR", { weekday: "long" }) : " "}
        </div>
        <div className="text-xs text-muted-foreground">
          {time ? time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : " "}
        </div>
        <div className="mt-1 font-mono text-5xl font-light text-foreground tracking-tight">
          {time ? time.toLocaleTimeString("ko-KR", { hour12: false }) : "00:00:00"}
        </div>
      </div>

      <div className="my-5 border-t border-border" />

      {/* System status indicator */}
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <div className={`h-1.5 w-1.5 rounded-full ${systemOk ? "bg-status-success animate-pulse" : "bg-status-error"}`} />
        <span className="font-mono text-[10px] text-muted-foreground">
          {systemOk ? "System Nominal" : "Issues Detected"}
        </span>
      </div>

      <div className="my-3 border-t border-border" />

      {/* Notifications */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-primary text-[9px] font-bold text-primary-foreground">
            {logs.length}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">NOTIFICATIONS</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-center gap-2">
              <div className={cn("h-1.5 w-1.5 rounded-full", log.color)} />
              <span className="text-[10px] font-bold text-foreground">{log.title}</span>
              {log.type === "error" && <span className="rounded bg-status-error/20 px-1 text-[8px] text-status-error">ERR</span>}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{log.desc}</p>
            <p className="mt-0.5 text-[9px] text-muted-foreground/60">{log.time}</p>
          </div>
        ))}
      </div>

      {/* Wireframe image */}
      <div className="mt-4 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/computer-wireframe.gif" alt="" className="h-28 w-28 opacity-30" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Supabase Realtime hook — revalidates SWR on device changes
// ---------------------------------------------------------------------------

function useRealtimeDevices() {
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    if (!supabase) return;

    const channel = supabase
      .channel("dashboard-devices")
      .on("postgres_changes", { event: "*", schema: "public", table: "devices" }, () => {
        mutate("/api/dashboard/realtime");
        mutate("/api/workers");
        mutate("/api/overview");
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  // 1. 스탯 카드: GET /api/overview (30s)
  const {
    data: overview,
    error: ovError,
    isLoading: ovLoading,
    mutate: mutateOverview,
  } = useSWR<OverviewData>("/api/overview", fetcher, { refreshInterval: 30_000 });

  const {
    data: realtime,
    error: rtError,
    isLoading: rtLoading,
    mutate: mutateRt,
  } = useSWR<RealtimeData>("/api/dashboard/realtime", fetcher, { refreshInterval: 60_000 });

  const {
    data: workersRaw,
    error: wError,
    isLoading: wLoading,
    mutate: mutateW,
  } = useSWR<{ workers: WorkerData[] }>("/api/workers", fetcher, { refreshInterval: 30_000 });

  const { data: health } = useSWR<HealthData>("/api/health", fetcher, { refreshInterval: 60_000 });

  const {
    data: tasksData,
    error: tasksError,
    isLoading: tasksLoading,
    mutate: mutateTasks,
  } = useSWR<{ tasks: TaskListItem[] }>("/api/tasks", fetcher, { refreshInterval: 30_000 });

  useRealtimeDevices();

  // 스탯 카드 전용: overview 기반 (null 방어)
  const statsOnline = overview?.devices?.online ?? 0;
  const statsTotal = overview?.devices?.total ?? 0;
  const statsOnlinePct = statsTotal > 0 ? Math.round((statsOnline / statsTotal) * 100) : 0;
  const statsViewsToday = overview?.tasks?.completed_today ?? 0;
  const statsActiveTasks = (overview?.tasks?.running ?? 0) + (overview?.tasks?.pending ?? 0);

  const workers = workersRaw?.workers ?? [];
  const recentTasksList = tasksData?.tasks ?? [];
  const lastUpdated = overview?.timestamp ?? realtime?.timestamp;

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-border bg-card">
              <Activity className="h-4 w-4 text-status-info" />
            </div>
            <h1 className="text-xl font-bold uppercase tracking-wide text-foreground">Overview</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => { mutateOverview(); mutateRt(); mutateW(); }}
              aria-label="새로고침"
              className="rounded border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            {lastUpdated && (
              <span className="font-mono text-[11px] text-muted-foreground">
                Last updated {new Date(lastUpdated).toLocaleTimeString("ko-KR", { hour12: false })}
              </span>
            )}
          </div>
        </div>

        {/* KPI Cards — GET /api/overview */}
        {ovError && !overview ? (
          <ErrorBlock message={ovError.message} onRetry={() => mutateOverview()} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KPICard
              label="DEVICE ONLINE RATE"
              value={`${statsOnlinePct}%`}
              trend={statsOnlinePct >= 90 ? "up" : statsOnlinePct > 0 ? "down" : "neutral"}
              loading={ovLoading}
            />
            <KPICard
              label="TOTAL VIEWS TODAY"
              value={fmt(statsViewsToday)}
              trend={statsViewsToday > 0 ? "up" : "neutral"}
              loading={ovLoading}
            />
            <KPICard
              label="ACTIVE TASKS"
              value={String(statsActiveTasks)}
              trend={statsActiveTasks > 0 ? "up" : "neutral"}
              loading={ovLoading}
            />
          </div>
        )}

        {/* Chart — GET /api/dashboard/realtime (60s) */}
        <ActivityChart data={realtime ?? null} loading={rtLoading} />

        {/* Recent Tasks — GET /api/tasks (30s) */}
        <RecentTasks
          tasks={recentTasksList}
          loading={tasksLoading}
          error={tasksError}
          onRetry={() => mutateTasks()}
        />

        {/* Bottom: PC Ranking + Device Status */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PCRanking
            workers={workers}
            loading={wLoading}
            error={wError}
            onRetry={() => mutateW()}
          />
          <SecurityStatus data={realtime ?? null} loading={rtLoading} />
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel data={realtime ?? null} health={health} />
    </div>
  );
}
