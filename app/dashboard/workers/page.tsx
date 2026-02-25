"use client";

import { useEffect, useState } from "react";
import { Server, RefreshCw, Wifi, WifiOff, Smartphone, Clock, Cpu, HardDrive, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Worker {
  id: string;
  hostname?: string;
  pc_number?: string;
  status: string;
  device_count?: number;
  online_count?: number;
  last_heartbeat?: string;
  ip_local?: string;
  ip_public?: string;
  xiaowei_connected?: boolean;
  created_at?: string;
}

function cn(...c: (string | false | undefined)[]) { return c.filter(Boolean).join(" "); }

function timeSince(dateStr: string | null | undefined): string {
  if (!dateStr) return "없음";
  const sec = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  return `${Math.floor(sec / 86400)}일 전`;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkers = () => {
    fetch("/api/workers")
      .then((r) => r.json())
      .then((d) => setWorkers(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWorkers();
    const t = setInterval(fetchWorkers, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  const onlineCount = workers.filter((w) => w.status === "online").length;
  const totalDevices = workers.reduce((s, w) => s + (w.device_count || 0), 0);
  const onlineDevices = workers.reduce((s, w) => s + (w.online_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">PC 관리</h1>
          <p className="text-sm text-slate-500">
            {onlineCount}/{workers.length} PC 온라인 · {onlineDevices}/{totalDevices} 디바이스
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchWorkers(); }}
          className="flex items-center gap-1.5 rounded-lg border border-[#1e2130] bg-[#12141d] px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw className="h-3 w-3" /> 새로고침
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" /> PC 온라인
          </div>
          <div className="mt-2 font-mono text-3xl font-bold text-white">{onlineCount}<span className="text-lg text-slate-500">/{workers.length}</span></div>
        </div>
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
            <div className="h-2 w-2 rounded-full bg-blue-500" /> 디바이스
          </div>
          <div className="mt-2 font-mono text-3xl font-bold text-white">{onlineDevices}<span className="text-lg text-slate-500">/{totalDevices}</span></div>
        </div>
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-4">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
            <div className={cn("h-2 w-2 rounded-full", onlineCount === workers.length ? "bg-green-500" : "bg-amber-500")} /> 가동률
          </div>
          <div className="mt-2 font-mono text-3xl font-bold text-white">
            {totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* PC Cards Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workers.map((w) => {
          const name = w.pc_number || w.hostname || w.id?.substring(0, 8);
          const isOnline = w.status === "online";
          const online = w.online_count || 0;
          const total = w.device_count || 0;
          const pct = total > 0 ? Math.round((online / total) * 100) : 0;

          return (
            <div
              key={w.id}
              className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5 hover:border-[#2a2d40] transition-colors group"
            >
              {/* Header: name + status */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-xl",
                    isOnline ? "bg-green-900/20" : "bg-slate-800/50"
                  )}>
                    <Server className={cn("h-5 w-5", isOnline ? "text-green-400" : "text-slate-500")} />
                  </div>
                  <div>
                    <div className="font-mono text-lg font-bold text-white">{name}</div>
                    <div className="flex items-center gap-1.5">
                      <div className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-green-500 animate-pulse" : "bg-slate-600")} />
                      <span className={cn("text-[10px] uppercase tracking-wider", isOnline ? "text-green-400" : "text-slate-500")}>
                        {isOnline ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>
                  </div>
                </div>
                {name === "PC00" && (
                  <span className="rounded bg-blue-900/30 px-1.5 py-0.5 text-[9px] font-bold text-blue-400">TEST</span>
                )}
              </div>

              {/* Device progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Smartphone className="h-3 w-3" /> 디바이스
                  </span>
                  <span className="font-mono text-xs text-slate-300">{online}/{total}</span>
                </div>
                <div className="h-2.5 rounded-full bg-[#1e2130]">
                  <div className={cn(
                    "h-2.5 rounded-full transition-all",
                    pct >= 90 ? "bg-green-600" : pct >= 50 ? "bg-amber-600" : "bg-red-600"
                  )} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-right font-mono text-[10px] text-slate-500">{pct}%</div>
              </div>

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="h-3 w-3" />
                  <span>하트비트</span>
                </div>
                <div className="text-right font-mono text-slate-400">
                  {timeSince(w.last_heartbeat)}
                </div>

                <div className="flex items-center gap-1.5 text-slate-500">
                  <Wifi className="h-3 w-3" />
                  <span>Xiaowei</span>
                </div>
                <div className="text-right">
                  <span className={cn("font-mono text-[10px]",
                    w.xiaowei_connected !== false ? "text-green-400" : "text-red-400"
                  )}>
                    {w.xiaowei_connected !== false ? "Connected" : "Disconnected"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-slate-500">
                  <HardDrive className="h-3 w-3" />
                  <span>IP</span>
                </div>
                <div className="text-right font-mono text-slate-400 text-[10px]">
                  {w.ip_local || "—"}
                </div>

                <div className="flex items-center gap-1.5 text-slate-500">
                  <Cpu className="h-3 w-3" />
                  <span>Agent</span>
                </div>
                <div className="text-right font-mono text-slate-400 text-[10px]">
                  v2.1
                </div>
              </div>

              {/* View devices link */}
              <Link
                href={`/dashboard/devices?pc=${w.id}`}
                className="mt-4 flex items-center justify-center gap-1 rounded-lg border border-[#1e2130] bg-[#0d1117] py-2 text-xs text-slate-500 hover:text-blue-400 hover:border-blue-900/30 transition-colors"
              >
                디바이스 보기 <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          );
        })}

        {workers.length === 0 && (
          <div className="col-span-full rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
            <WifiOff className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">연결된 PC가 없습니다</p>
            <p className="mt-1 text-xs text-slate-600">Agent를 시작하면 자동으로 등록됩니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
