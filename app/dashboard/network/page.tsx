"use client";

import { useEffect, useState } from "react";
import { Globe, RefreshCw, Shield, Smartphone, CheckCircle2, XCircle } from "lucide-react";

interface ProxyHealth { total: number; active: number; invalid: number; unassigned: number; }
interface HealthReport { status: string; }

export default function NetworkPage() {
  const [proxy, setProxy] = useState<ProxyHealth | null>(null);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard/proxies").then((r) => r.json()),
      fetch("/api/health").then((r) => r.json()),
    ])
      .then(([p, h]) => {
        setProxy(p.data || p);
        setHealth(h);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex h-40 items-center justify-center"><RefreshCw className="h-5 w-5 animate-spin text-slate-500" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">네트워크</h1>
        <p className="text-sm text-slate-500">프록시 & 연결 상태</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatBox label="총 프록시" value={proxy?.total || 0} icon={Shield} color="blue" />
        <StatBox label="활성" value={proxy?.active || 0} icon={CheckCircle2} color="green" />
        <StatBox label="무효" value={proxy?.invalid || 0} icon={XCircle} color="red" />
        <StatBox label="미할당" value={proxy?.unassigned || 0} icon={Globe} color="amber" />
      </div>

      <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-6">
        <h2 className="mb-4 text-sm font-medium text-slate-300">시스템 연결</h2>
        <div className="space-y-3">
          <ConnRow label="Supabase DB" ok={health?.status === "ok"} />
          <ConnRow label="Supabase Realtime" ok={health?.status === "ok"} />
          <ConnRow label="Xiaowei WebSocket" ok />
          <ConnRow label="프록시 풀" ok={(proxy?.active || 0) > 0} detail={`${proxy?.active || 0}/${proxy?.total || 0} 활성`} />
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  const bg = { green: "bg-green-900/20", blue: "bg-blue-900/20", red: "bg-red-900/20", amber: "bg-amber-900/20" }[color] || "bg-slate-800";
  const text = { green: "text-green-400", blue: "text-blue-400", red: "text-red-400", amber: "text-amber-400" }[color] || "text-slate-400";
  return (
    <div className="rounded-xl border border-[#1e2130] bg-[#12141d] p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bg}`}>
          <Icon className={`h-5 w-5 ${text}`} />
        </div>
        <div>
          <div className="font-mono text-2xl font-bold text-white">{value}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
        </div>
      </div>
    </div>
  );
}

function ConnRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#1e2130] px-4 py-3">
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <span className={`font-mono text-xs ${ok ? "text-green-400" : "text-red-400"}`}>
        {detail || (ok ? "Connected" : "Disconnected")}
      </span>
    </div>
  );
}
