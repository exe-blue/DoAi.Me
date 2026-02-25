"use client";

import { useEffect, useState } from "react";
import { Server, RefreshCw, Smartphone, Wifi } from "lucide-react";

interface Worker {
  id: string;
  hostname?: string;
  pc_number?: string;
  status: string;
  device_count?: number;
  online_count?: number;
  last_heartbeat?: string;
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers")
      .then((r) => r.json())
      .then((d) => setWorkers(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">PC 관리</h1>
        <p className="text-sm text-slate-500">
          {workers.filter((w) => w.status === "online").length}/{workers.length} 온라인
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workers.map((w) => {
          const name = w.pc_number || w.hostname || w.id?.substring(0, 8);
          const isOnline = w.status === "online";
          const online = w.online_count || 0;
          const total = w.device_count || 100;
          const pct = total > 0 ? Math.round((online / total) * 100) : 0;

          return (
            <div
              key={w.id}
              className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5 hover:border-[#2a2d40] transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isOnline ? "bg-green-900/30" : "bg-slate-800"}`}>
                    <Server className={`h-5 w-5 ${isOnline ? "text-green-400" : "text-slate-500"}`} />
                  </div>
                  <div>
                    <div className="font-mono text-lg font-bold text-white">{name}</div>
                    <div className="flex items-center gap-1.5">
                      <div className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-green-500 animate-pulse" : "bg-slate-600"}`} />
                      <span className={`text-xs ${isOnline ? "text-green-400" : "text-slate-500"}`}>
                        {isOnline ? "온라인" : "오프라인"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-2xl font-bold text-white">{online}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">/ {total} devices</div>
                </div>
              </div>

              <div className="mt-4">
                <div className="h-2 rounded-full bg-[#1e2130]">
                  <div
                    className="h-2 rounded-full bg-green-600 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
                  <span>{pct}% 가동</span>
                  <span>
                    {w.last_heartbeat
                      ? `마지막 하트비트: ${new Date(w.last_heartbeat).toLocaleTimeString("ko-KR")}`
                      : "하트비트 없음"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {workers.length === 0 && (
          <div className="col-span-full rounded-xl border border-[#1e2130] bg-[#12141d] p-12 text-center">
            <Wifi className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-500">연결된 PC가 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
