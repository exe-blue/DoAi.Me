"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Smartphone, Eye, Heart, Zap, Clock, Server, AlertTriangle,
  RefreshCw, CheckCircle2, XCircle, Wifi,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ── Types ──
interface RealtimeData {
  totalDevices: number;
  online: number;
  offline: number;
  busy: number;
  error: number;
  activeMissions: number;
  todayStats: { views: number; errors: number; likes?: number; comments?: number };
  pcs: Array<{ pc_number: string; status: string; id: string }>;
}

interface WorkerData {
  id: string;
  hostname?: string;
  pc_number?: string;
  status: string;
  device_count?: number;
  online_count?: number;
}

// ── Helpers ──
function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

// ── Stat Card ──
function StatCard({
  label, value, icon: Icon, color, pulse, sub,
}: {
  label: string; value: string | number; icon: React.ElementType;
  color: "green" | "blue" | "amber" | "red"; pulse?: boolean; sub?: string;
}) {
  const colorMap = {
    green: "bg-green-500", blue: "bg-blue-500", amber: "bg-amber-500", red: "bg-red-500",
  };
  return (
    <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className={cn("h-2 w-2 rounded-full", colorMap[color], pulse && "animate-pulse")} />
            <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
              {label}
            </span>
          </div>
          <div className="mt-2 font-mono text-3xl font-bold text-white">
            {value}
          </div>
          {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
        </div>
        <Icon className="h-8 w-8 text-slate-700" />
      </div>
    </div>
  );
}

// ── Worker Row ──
function WorkerRow({ worker, totalDevices = 100 }: { worker: WorkerData; totalDevices?: number }) {
  const online = worker.online_count || 0;
  const total = worker.device_count || totalDevices;
  const pct = total > 0 ? (online / total) * 100 : 0;
  const isOnline = worker.status === "online";
  const name = worker.pc_number || worker.hostname || worker.id?.substring(0, 8);

  return (
    <div className="flex items-center gap-3 py-2">
      <div className={cn("h-2 w-2 rounded-full", isOnline ? "bg-green-500" : "bg-slate-600")} />
      <span className="w-14 text-sm text-slate-300">{name}</span>
      <div className="flex-1">
        <div className="h-2 rounded-full bg-[#1e2130]">
          <div
            className="h-2 rounded-full bg-green-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="font-mono text-xs text-slate-400">
        {online}/{total}
      </span>
    </div>
  );
}

// ── Mock Chart Data (replaced by real API in production) ──
function generateChartData() {
  const now = new Date();
  const data = [];
  for (let h = 0; h < 24; h++) {
    const hour = String(h).padStart(2, "0") + ":00";
    const isPast = h <= now.getHours();
    data.push({
      hour,
      views: isPast ? Math.floor(Math.random() * 800 + 200) : 0,
      likes: isPast ? Math.floor(Math.random() * 200 + 50) : 0,
      comments: isPast ? Math.floor(Math.random() * 50 + 10) : 0,
    });
  }
  return data;
}

// ── Right Panel ──
function RightPanel({ data, health }: { data: RealtimeData | null; health: boolean }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-80 shrink-0 border-l border-[#1e2130] bg-[#0f1117] p-5 hidden xl:block overflow-y-auto">
      {/* Clock */}
      <div className="text-center">
        <div className="font-mono text-4xl font-light text-white">
          {time.toLocaleTimeString("ko-KR", { hour12: false })}
        </div>
        <div className="mt-1 text-sm text-slate-500">
          {time.toLocaleDateString("ko-KR", { weekday: "long", month: "long", day: "numeric" })}
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <div className={cn("h-1.5 w-1.5 rounded-full", health ? "bg-green-500 animate-pulse" : "bg-red-500")} />
          <span className={cn("font-mono text-xs", health ? "text-green-400" : "text-red-400")}>
            {health ? "System Nominal" : "Issues Detected"}
          </span>
        </div>
      </div>

      <div className="my-5 border-t border-[#1e2130]" />

      {/* Resources */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
            RESOURCES
          </span>
        </div>
        <div className="space-y-3">
          <ResourceRow label="DEVICES" value={`${data?.online || 0} / ${data?.totalDevices || 0}`} ok={(data?.online || 0) > 0} />
          <ResourceRow label="ACTIVE TASKS" value={String(data?.activeMissions || 0)} ok={(data?.activeMissions || 0) > 0} />
          <ResourceRow label="ERRORS TODAY" value={String(data?.todayStats?.errors || 0)} ok={(data?.todayStats?.errors || 0) < 10} />
        </div>
      </div>

      <div className="my-5 border-t border-[#1e2130]" />

      {/* PC Status */}
      <div>
        <span className="text-[10px] font-medium uppercase tracking-widest text-slate-500">
          PC STATUS
        </span>
        <div className="mt-2 space-y-2">
          {(data?.pcs || []).map((pc) => (
            <div key={pc.id} className="flex items-center gap-2">
              <div className={cn("h-1.5 w-1.5 rounded-full", pc.status === "online" ? "bg-green-500" : "bg-slate-600")} />
              <span className="font-mono text-xs text-slate-400">{pc.pc_number}</span>
              <span className={cn("text-[10px]", pc.status === "online" ? "text-green-400" : "text-slate-600")}>
                {pc.status}
              </span>
            </div>
          ))}
          {(!data?.pcs || data.pcs.length === 0) && (
            <span className="text-xs text-slate-600">No PCs connected</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#1e2130] bg-[#12141d] px-3 py-2">
      <div className="flex items-center gap-2">
        <div className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-green-500" : "bg-amber-500")} />
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <span className="font-mono text-sm text-slate-300">{value}</span>
    </div>
  );
}

// ── Main Page ──
export default function DashboardPage() {
  const [data, setData] = useState<RealtimeData | null>(null);
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [health, setHealth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [chartData] = useState(generateChartData);

  const fetchData = useCallback(async () => {
    try {
      const [rtRes, wRes, hRes] = await Promise.all([
        fetch("/api/dashboard/realtime").then((r) => r.json()),
        fetch("/api/workers").then((r) => r.json()),
        fetch("/api/health").then((r) => r.json()),
      ]);
      if (rtRes.data) setData(rtRes.data);
      if (Array.isArray(wRes)) setWorkers(wRes);
      else if (wRes.data && Array.isArray(wRes.data)) setWorkers(wRes.data);
      setHealth(hRes.status === "ok");
      setLastUpdated(new Date());
    } catch {
      setHealth(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 30000);
    return () => clearInterval(t);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Overview</h1>
          <span className="text-xs text-slate-500">
            Last updated {lastUpdated.toLocaleTimeString("ko-KR")}
          </span>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Online"
            value={`${data?.online || 0}/${data?.totalDevices || 0}`}
            icon={Smartphone}
            color="green"
            pulse
            sub={`${data?.offline || 0} offline, ${data?.error || 0} error`}
          />
          <StatCard
            label="Views Today"
            value={formatNumber(data?.todayStats?.views || 0)}
            icon={Eye}
            color="blue"
          />
          <StatCard
            label="Likes Today"
            value={formatNumber(data?.todayStats?.likes || 0)}
            icon={Heart}
            color="blue"
          />
          <StatCard
            label="Tasks Running"
            value={data?.activeMissions || 0}
            icon={Zap}
            color="amber"
          />
        </div>

        {/* Chart */}
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-300">24시간 활동</span>
            <div className="flex gap-4 text-[10px] text-slate-500">
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-green-500" /> 시청
              </span>
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-blue-500" /> 좋아요
              </span>
              <span className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-amber-500" /> 댓글
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1e2130" vertical={false} />
              <XAxis dataKey="hour" tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#475569", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: "#12141d", border: "1px solid #1e2130", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Area type="monotone" dataKey="views" stroke="#22c55e" fill="url(#viewsGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="likes" stroke="#3b82f6" fill="transparent" strokeWidth={1.5} />
              <Area type="monotone" dataKey="comments" stroke="#f59e0b" fill="transparent" strokeWidth={1.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 2-Column: Workers + Recent Tasks */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Workers */}
          <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
            <div className="mb-3 flex items-center gap-2">
              <Server className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-300">WORKERS</span>
              <span className="rounded bg-green-900/30 px-1.5 py-0.5 text-[10px] text-green-400">
                {workers.filter((w) => w.status === "online").length} online
              </span>
            </div>
            <div className="space-y-1">
              {workers.length > 0 ? (
                workers.map((w) => <WorkerRow key={w.id} worker={w} />)
              ) : (
                <p className="text-sm text-slate-600">연결된 PC 없음</p>
              )}
            </div>
          </div>

          {/* System Health */}
          <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-500" />
              <span className="text-sm font-medium text-slate-300">SYSTEM HEALTH</span>
            </div>
            <div className="space-y-3">
              <HealthRow label="Supabase" ok={health} />
              <HealthRow label="Xiaowei" ok={(data?.online || 0) > 0} />
              <HealthRow label="하트비트" ok={workers.some((w) => w.status === "online")} />
              <HealthRow
                label="에러율"
                ok={(data?.todayStats?.errors || 0) < (data?.todayStats?.views || 1) * 0.2}
                value={`${data?.todayStats?.errors || 0}건`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel data={data} health={health} />
    </div>
  );
}

function HealthRow({ label, ok, value }: { label: string; ok: boolean; value?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        {ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        )}
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <span className={cn("text-xs font-mono", ok ? "text-green-400" : "text-red-400")}>
        {value || (ok ? "OK" : "ERROR")}
      </span>
    </div>
  );
}
