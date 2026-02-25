"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Smartphone, Eye, Heart, Zap, TrendingUp, TrendingDown,
  Server, RefreshCw, CheckCircle2, XCircle, MessageSquare,
  AlertTriangle, Clock, Wifi, Activity,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Types ──
interface RealtimeData {
  totalDevices: number; online: number; offline: number; busy: number; error: number;
  activeMissions: number;
  todayStats: { views: number; errors: number; likes?: number; comments?: number };
  pcs: Array<{ pc_number: string; status: string; id: string }>;
}
interface WorkerData {
  id: string; hostname?: string; pc_number?: string; status: string;
  device_count?: number; online_count?: number;
}

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(" "); }
function fmt(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

// ── KPI Card ──
function KPICard({ label, value, trend, suffix }: {
  label: string; value: string | number; trend: "up" | "down" | "neutral"; suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-[#1a2332] bg-[#0d1520] p-5 relative overflow-hidden">
      <div className="relative z-10">
        <div className="flex items-end gap-2">
          <span className="font-mono text-4xl font-bold text-white">{value}</span>
          {suffix && <span className="mb-1 font-mono text-lg text-slate-400">{suffix}</span>}
          <div className="mb-1.5 ml-auto">
            {trend === "up" && <TrendingUp className="h-6 w-6 text-green-400 animate-bounce" style={{ animationDuration: "2s" }} />}
            {trend === "down" && <TrendingDown className="h-6 w-6 text-red-400 animate-bounce" style={{ animationDuration: "2s" }} />}
            {trend === "neutral" && <Activity className="h-6 w-6 text-blue-400" />}
          </div>
        </div>
        <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">
          {label}
        </div>
      </div>
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "radial-gradient(circle, #3b82f6 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }} />
    </div>
  );
}

// ── Chart ──
function ActivityChart({ data, tab, setTab }: { data: any[]; tab: string; setTab: (t: string) => void }) {
  return (
    <div className="rounded-lg border border-[#1a2332] bg-[#0d1520] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1">
          {["TODAY", "WEEK", "MONTH"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-3 py-1 text-[10px] font-bold tracking-wider transition-colors",
                tab === t ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-4 text-[10px]">
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-green-500" /> 시청</span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-blue-500" /> 좋아요</span>
          <span className="flex items-center gap-1.5"><div className="h-2 w-2 rounded-full bg-amber-500" /> 댓글</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1a2332" vertical={false} />
          <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#475569", fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={45}
            tickFormatter={(v: number) => v >= 1000 ? (v / 1000) + "K" : String(v)} />
          <Tooltip contentStyle={{ background: "#0d1520", border: "1px solid #1a2332", borderRadius: 6, fontFamily: "monospace", fontSize: 11 }} />
          <Area type="monotone" dataKey="views" stroke="#22c55e" fill="url(#gViews)" strokeWidth={2} />
          <Area type="monotone" dataKey="likes" stroke="#3b82f6" fill="transparent" strokeWidth={1.5} />
          <Area type="monotone" dataKey="comments" stroke="#f59e0b" fill="transparent" strokeWidth={1.5} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── PC Ranking ──
function PCRanking({ workers }: { workers: WorkerData[] }) {
  const sorted = [...workers].sort((a, b) => (b.online_count || 0) - (a.online_count || 0));
  return (
    <div className="rounded-lg border border-[#1a2332] bg-[#0d1520] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-green-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">PC RANKING</span>
        <span className="rounded bg-green-900/40 px-1.5 py-0.5 text-[9px] font-bold text-green-400">
          {workers.filter(w => w.status === "online").length} ONLINE
        </span>
      </div>
      <div className="space-y-2">
        {sorted.map((w, i) => {
          const name = w.pc_number || w.hostname || "PC??";
          const online = w.online_count || 0;
          const total = w.device_count || 100;
          const pct = total > 0 ? Math.round((online / total) * 100) : 0;
          const isOnline = w.status === "online";
          return (
            <div key={w.id} className="flex items-center gap-3 rounded-lg bg-[#111827]/50 px-3 py-2.5">
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded text-[10px] font-bold",
                i === 0 ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-500"
              )}>
                {i + 1}
              </span>
              <div className={cn("h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-slate-600")} />
              <span className="font-mono text-sm font-bold text-white">{name}</span>
              <div className="flex-1">
                <div className="h-1.5 rounded-full bg-[#1a2332]">
                  <div className="h-1.5 rounded-full bg-green-600/80 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className="font-mono text-xs text-slate-400">{pct}%</span>
              <span className="font-mono text-[10px] text-slate-500">{online}/{total}</span>
            </div>
          );
        })}
        {workers.length === 0 && <p className="py-4 text-center text-xs text-slate-600">연결된 PC 없음</p>}
      </div>
    </div>
  );
}

// ── Security Status (기기 상태 + 와이어프레임 이미지) ──
function SecurityStatus({ data }: { data: RealtimeData | null }) {
  const online = data?.online || 0;
  const total = data?.totalDevices || 0;
  const survivalRate = total > 0 ? Math.round((online / total) * 100) : 0;
  const tasks = data?.activeMissions || 0;

  return (
    <div className="rounded-lg border border-[#1a2332] bg-[#0d1520] p-5 relative overflow-hidden">
      <div className="mb-4 flex items-center gap-2">
        <Wifi className="h-4 w-4 text-green-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">DEVICE STATUS</span>
        <span className="rounded bg-green-900/40 px-1.5 py-0.5 text-[9px] font-bold text-green-400">ONLINE</span>
      </div>
      <div className="relative z-10 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-green-900/30 bg-green-950/20 p-3">
          <div className="text-[10px] font-bold text-green-500">ONLINE DEVICES</div>
          <div className="font-mono text-2xl font-bold text-green-400">{online}/{total}</div>
          <div className="text-[9px] text-green-600">[CONNECTED]</div>
        </div>
        <div className="rounded-lg border border-green-900/30 bg-green-950/20 p-3">
          <div className="text-[10px] font-bold text-green-500">SURVIVAL RATE</div>
          <div className="font-mono text-2xl font-bold text-green-400">{survivalRate}%</div>
          <div className="text-[9px] text-green-600">[STABLE]</div>
        </div>
        <div className="col-span-2 rounded-lg border border-blue-900/30 bg-blue-950/20 p-3">
          <div className="text-[10px] font-bold text-blue-500">REMAINING TASKS</div>
          <div className="font-mono text-2xl font-bold text-blue-400">{tasks}</div>
          <div className="text-[9px] text-blue-600">[IN QUEUE]</div>
        </div>
      </div>
      {/* Wireframe robot image background */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/robot-wireframe.gif"
        alt=""
        className="absolute -right-4 -bottom-4 h-40 w-40 opacity-20 pointer-events-none"
      />
    </div>
  );
}

// ── Right Panel ──
function RightPanel({ data, health }: { data: RealtimeData | null; health: boolean }) {
  const [time, setTime] = useState(new Date());
  const [logs, setLogs] = useState<Array<{ type: string; title: string; desc: string; time: string; color: string }>>([]);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch("/api/dashboard/errors?hours=6")
      .then((r) => r.json())
      .then((d) => {
        const errs = (d.data?.errors || []).slice(0, 3).map((e: any) => ({
          type: "error", title: e.type?.toUpperCase() || "ERROR",
          desc: `${e.count}건 발생`, time: e.lastOccurred ? new Date(e.lastOccurred).toLocaleTimeString("ko-KR") : "",
          color: "bg-red-500",
        }));
        setLogs([
          ...errs,
          { type: "success", title: "TASK COMPLETED", desc: `${data?.todayStats?.views || 0}건 시청 완료`, time: "today", color: "bg-green-500" },
        ]);
      })
      .catch(() => {});
  }, [data]);

  return (
    <div className="w-80 shrink-0 border-l border-[#1a2332] bg-[#0a0e17] p-5 hidden xl:flex flex-col overflow-y-auto">
      {/* Clock */}
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-slate-500">
          {time.toLocaleDateString("ko-KR", { weekday: "long" })}
        </div>
        <div className="text-xs text-slate-400">
          {time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}
        </div>
        <div className="mt-1 font-mono text-5xl font-light text-white tracking-tight">
          {time.toLocaleTimeString("ko-KR", { hour12: false })}
        </div>
      </div>

      <div className="my-5 border-t border-[#1a2332]" />

      {/* Notifications */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-blue-600 text-[9px] font-bold text-white">
            {logs.length}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">NOTIFICATIONS</span>
        </div>
        <button className="text-[9px] uppercase tracking-wider text-slate-600 hover:text-slate-400">Clear All</button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {logs.map((log, i) => (
          <div key={i} className="rounded-lg border border-[#1a2332] bg-[#0d1520] p-3">
            <div className="flex items-center gap-2">
              <div className={cn("h-1.5 w-1.5 rounded-full", log.color)} />
              <span className="text-[10px] font-bold text-white">{log.title}</span>
              {log.type === "error" && <span className="rounded bg-red-900/30 px-1 text-[8px] text-red-400">ERR</span>}
            </div>
            <p className="mt-1 text-[11px] text-slate-500">{log.desc}</p>
            <p className="mt-0.5 text-[9px] text-slate-600">{log.time}</p>
          </div>
        ))}
      </div>

      {/* Wireframe computer image */}
      <div className="mt-4 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/computer-wireframe.gif"
          alt=""
          className="h-28 w-28 opacity-30"
        />
      </div>
    </div>
  );
}

// ── Chart Data ──
function generateChartData() {
  const now = new Date();
  return Array.from({ length: 24 }, (_, h) => ({
    hour: String(h).padStart(2, "0") + ":00",
    views: h <= now.getHours() ? Math.floor(Math.random() * 800 + 200) : 0,
    likes: h <= now.getHours() ? Math.floor(Math.random() * 200 + 50) : 0,
    comments: h <= now.getHours() ? Math.floor(Math.random() * 50 + 10) : 0,
  }));
}

// ── Main ──
export default function DashboardPage() {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [health, setHealth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [chartData] = useState(generateChartData);
  const [chartTab, setChartTab] = useState("TODAY");

  const fetchData = useCallback(async () => {
    try {
      const [rt, w, h] = await Promise.all([
        fetch("/api/dashboard/realtime").then((r) => r.json()),
        fetch("/api/workers").then((r) => r.json()),
        fetch("/api/health").then((r) => r.json()),
      ]);
      if (rt.data) setData(rt.data);
      setWorkers(Array.isArray(w) ? w : w.data || []);
      setHealth(h.status === "ok");
      setLastUpdated(new Date());
    } catch { setHealth(false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 30000); return () => clearInterval(t); }, [fetchData]);

  if (loading) {
    return <div className="flex h-[60vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-slate-500" /></div>;
  }

  const views = data?.todayStats?.views || 0;
  const likes = data?.todayStats?.likes || 0;
  const onlinePct = (data?.totalDevices || 0) > 0 ? Math.round(((data?.online || 0) / (data?.totalDevices || 1)) * 100) : 0;

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded border border-[#1a2332] bg-[#0d1520]">
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <h1 className="text-xl font-bold uppercase tracking-wide text-white">Overview</h1>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            Last updated {lastUpdated.toLocaleTimeString("ko-KR", { hour12: false })}
          </span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KPICard label="DEVICE ONLINE RATE" value={`${onlinePct}%`} trend={onlinePct > 90 ? "up" : "down"} />
          <KPICard label="TOTAL VIEWS TODAY" value={fmt(views)} trend={views > 0 ? "up" : "neutral"} suffix="" />
          <KPICard label="ACTIVE TASKS" value={String(data?.activeMissions || 0)} trend={(data?.activeMissions || 0) > 0 ? "up" : "neutral"} />
        </div>

        {/* Chart */}
        <ActivityChart data={chartData} tab={chartTab} setTab={setChartTab} />

        {/* Bottom: PC Ranking + Security Status */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <PCRanking workers={workers} />
          <SecurityStatus data={data} />
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel data={data} health={health} />
    </div>
  );
}
