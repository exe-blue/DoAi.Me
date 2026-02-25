"use client";

import { useEffect, useState } from "react";
import { Smartphone, Search, RefreshCw, Wifi, WifiOff, AlertTriangle, Battery } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Device {
  id: string;
  serial_number: string;
  pc_id: string;
  status: string;
  model: string | null;
  battery_level: number | null;
  last_seen_at: string | null;
  ip_intranet: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  online: "bg-green-500",
  busy: "bg-blue-500",
  offline: "bg-slate-600",
  error: "bg-red-500",
};

const STATUS_LABELS: Record<string, string> = {
  online: "온라인",
  busy: "작업중",
  offline: "오프라인",
  error: "에러",
};

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetch("/api/devices")
      .then((r) => r.json())
      .then((d) => setDevices(Array.isArray(d) ? d : d.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = devices.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.serial_number?.toLowerCase().includes(q) ||
        d.model?.toLowerCase().includes(q) ||
        d.ip_intranet?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    online: devices.filter((d) => d.status === "online").length,
    busy: devices.filter((d) => d.status === "busy").length,
    offline: devices.filter((d) => d.status === "offline").length,
    error: devices.filter((d) => d.status === "error").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">디바이스</h1>
          <p className="text-sm text-slate-500">{devices.length}대 등록됨</p>
        </div>
        <div className="flex gap-2 text-xs">
          {Object.entries(counts).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 rounded-full border border-[#1e2130] bg-[#12141d] px-2.5 py-1">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLORS[k]}`} />
              <span className="text-slate-400">{STATUS_LABELS[k]}</span>
              <span className="font-mono text-slate-300">{v}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="시리얼, 모델, IP 검색..."
            className="border-[#1e2130] bg-[#12141d] pl-9 text-sm text-slate-300"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="online">온라인</SelectItem>
            <SelectItem value="busy">작업중</SelectItem>
            <SelectItem value="offline">오프라인</SelectItem>
            <SelectItem value="error">에러</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <RefreshCw className="h-5 w-5 animate-spin text-slate-500" />
        </div>
      ) : (
        <div className="rounded-xl border border-[#1e2130] bg-[#12141d] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">시리얼</th>
                <th className="px-4 py-3">모델</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">배터리</th>
                <th className="px-4 py-3">마지막 응답</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-[#1e2130]/50 hover:bg-[#1a1d2e]/30">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[d.status] || "bg-slate-600"}`} />
                      <span className="text-xs text-slate-400">{STATUS_LABELS[d.status] || d.status}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{d.serial_number}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{d.model || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{d.ip_intranet || "—"}</td>
                  <td className="px-4 py-2.5">
                    {d.battery_level != null ? (
                      <span className="flex items-center gap-1 text-xs">
                        <Battery className={`h-3 w-3 ${d.battery_level < 20 ? "text-red-400" : "text-slate-400"}`} />
                        <span className={d.battery_level < 20 ? "text-red-400" : "text-slate-400"}>
                          {d.battery_level}%
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {d.last_seen_at ? new Date(d.last_seen_at).toLocaleTimeString("ko-KR") : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-600">
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
