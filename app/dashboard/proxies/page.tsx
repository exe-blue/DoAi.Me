"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { mutate as globalMutate } from "swr";
import {
  Shield,
  Search,
  RefreshCw,
  Plus,
  Wand2,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Trash2,
  Globe,
  Smartphone,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";

interface Proxy {
  id: string;
  address: string;
  type: string;
  status: string;
  device_id?: string | null;
  device_serial?: string | null;
  fail_count?: number;
  last_checked?: string | null;
  last_error?: string | null;
  username?: string | null;
  provider?: string | null;
  worker_id?: string | null;
  assigned_count?: number;
  created_at?: string;
}

function cn(...c: (string | false | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

function timeSince(d: string | null | undefined): string {
  if (!d) return "—";
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}초 전`;
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
}

const ST: Record<
  string,
  { color: string; label: string; icon: React.ElementType }
> = {
  active: { color: "text-green-400", label: "활성", icon: CheckCircle2 },
  valid: { color: "text-green-400", label: "유효", icon: CheckCircle2 },
  invalid: { color: "text-red-400", label: "무효", icon: XCircle },
  testing: { color: "text-amber-400", label: "테스트중", icon: Activity },
};

const PROXIES_KEY = "/api/proxies";
const DEVICES_KEY = "/api/devices";
const WORKERS_KEY = "/api/workers";

interface DeviceRow {
  id: string;
  pc_id: string | null;
  proxy_id: string | null;
  management_code: string | null;
  serial_number?: string | null;
  name?: string | null;
}

interface WorkerRow {
  id: string;
  pc_number?: string | null;
  hostname?: string | null;
}

export default function ProxiesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<"proxy" | "device">("proxy");

  const { data, error, isLoading, mutate } = useSWR<{ proxies: Proxy[] }>(
    PROXIES_KEY,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: devicesData } = useSWR<{ devices: DeviceRow[] }>(
    DEVICES_KEY,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: workersData } = useSWR<{ workers: WorkerRow[] }>(
    WORKERS_KEY,
    fetcher,
    { refreshInterval: 30_000 }
  );

  const proxies = data?.proxies ?? [];
  const devices = devicesData?.devices ?? [];
  const workers = workersData?.workers ?? [];

  const filtered = useMemo(() => {
    return proxies.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.address?.toLowerCase().includes(q) ||
          p.type?.toLowerCase().includes(q) ||
          (p.device_serial ?? p.device_id ?? "")?.toString().toLowerCase().includes(q) ||
          (p.provider ?? "")?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [proxies, statusFilter, search]);

  const deviceLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of devices) {
      const pc = workers.find((w) => w.id === d.pc_id);
      const pcNum = pc?.pc_number ?? "?";
      const code = d.management_code ?? d.serial_number ?? d.id.slice(0, 8);
      map.set(d.id, `${pcNum}-${code}`);
    }
    return map;
  }, [devices, workers]);

  const unassignedDevicesCount = useMemo(
    () => devices.filter((d) => !d.proxy_id).length,
    [devices]
  );

  const counts = useMemo(
    () => ({
      total: proxies.length,
      active: proxies.filter(
        (p) => p.status === "active" || p.status === "valid"
      ).length,
      invalid: proxies.filter((p) => p.status === "invalid").length,
      unassigned: proxies.filter(
        (p) => !p.device_serial && !p.device_id
      ).length,
      unassignedDevices: unassignedDevicesCount,
      totalDevices: devices.length,
    }),
    [proxies, unassignedDevicesCount, devices.length]
  );

  const handleBulkAdd = async () => {
    const lines = bulkText
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("한 줄 이상 입력하세요");
      return;
    }
    setActionLoading("bulk");
    const res = await apiClient.post<{ inserted?: number; proxies?: unknown[] }>(
      "/api/proxies/bulk",
      { body: { proxies: lines } }
    );
    setActionLoading(null);
    if (res.success) {
      toast.success(`${res.data?.inserted ?? lines.length}개 추가됨`);
      setBulkOpen(false);
      setBulkText("");
      globalMutate(PROXIES_KEY);
    }
  };

  const handleAutoAssign = async () => {
    setActionLoading("assign");
    const res = await apiClient.post("/api/proxies/auto-assign", { body: {} });
    setActionLoading(null);
    if (res.success) {
      toast.success("자동 할당 완료");
      globalMutate(PROXIES_KEY);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await apiClient.delete(`/api/proxies/${id}`);
    if (res.success) {
      toast.success("삭제됨");
      mutate();
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">프록시</h1>
          <p className="text-sm text-slate-500">
            {counts.total}개 등록 · {counts.active} 활성 · {counts.unassigned} 프록시 미할당
            {counts.totalDevices > 0 && ` · 기기 ${counts.totalDevices}대 중 ${counts.unassignedDevices}대 미할당`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="전체 프록시" value={counts.total} color="blue" />
        <MiniStat label="활성" value={counts.active} color="green" />
        <MiniStat label="무효" value={counts.invalid} color="red" />
        <MiniStat label="프록시 미할당" value={counts.unassigned} color="amber" />
      </div>

      {counts.unassignedDevices > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-950/20 px-4 py-3">
          <Smartphone className="h-5 w-5 shrink-0 text-amber-400" />
          <span className="text-sm font-medium text-amber-200">
            미할당 기기: <strong>{counts.unassignedDevices}</strong>대
          </span>
          <span className="text-xs text-amber-200/80">
            (전체 기기 {counts.totalDevices}대 중 프록시가 배정되지 않은 기기)
          </span>
          <Button
            onClick={handleAutoAssign}
            size="sm"
            disabled={actionLoading === "assign"}
            className="ml-auto gap-1.5 bg-amber-600 hover:bg-amber-500"
          >
            {actionLoading === "assign" ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
            전체 자동 할당
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => setBulkOpen(true)}
          variant="outline"
          size="sm"
          className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:bg-[#1a1d2e] hover:text-white"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> 벌크 추가
        </Button>
        <Button
          onClick={handleAutoAssign}
          variant="outline"
          size="sm"
          disabled={actionLoading === "assign"}
          className="border-[#1e2130] bg-[#12141d] text-slate-300 hover:bg-[#1a1d2e] hover:text-white"
        >
          {actionLoading === "assign" ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wand2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          전체 자동 할당
        </Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-500" />
          <Input
            placeholder="검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-56 border-[#1e2130] bg-[#12141d] pl-8 text-xs text-slate-300"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-24 border-[#1e2130] bg-[#12141d] text-xs text-slate-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="valid">유효</SelectItem>
            <SelectItem value="invalid">무효</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1 rounded-lg border border-[#1e2130] bg-[#12141d] p-1">
        <button
          type="button"
          onClick={() => setViewTab("proxy")}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            viewTab === "proxy"
              ? "bg-primary text-primary-foreground"
              : "text-slate-400 hover:text-white"
          )}
        >
          <Shield className="mr-1.5 inline h-3.5 w-3.5" />
          프록시 기준
        </button>
        <button
          type="button"
          onClick={() => setViewTab("device")}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            viewTab === "device"
              ? "bg-primary text-primary-foreground"
              : "text-slate-400 hover:text-white"
          )}
        >
          <Smartphone className="mr-1.5 inline h-3.5 w-3.5" />
          기기 기준
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
          목록을 불러오지 못했습니다.{" "}
          <button
            type="button"
            onClick={() => mutate()}
            className="underline hover:no-underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-t-xl" />
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : viewTab === "device" ? (
        <div className="overflow-hidden rounded-xl border border-[#1e2130] bg-[#12141d]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">기기</th>
                <th className="px-4 py-3">PC</th>
                <th className="px-4 py-3">프록시</th>
                <th className="px-4 py-3">주소</th>
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const proxy = d.proxy_id ? proxies.find((p) => p.id === d.proxy_id) : null;
                const pc = workers.find((w) => w.id === d.pc_id);
                const label = deviceLabelMap.get(d.id) ?? d.management_code ?? d.serial_number ?? d.id.slice(0, 8);
                return (
                  <tr
                    key={d.id}
                    className="border-b border-[#1e2130]/50 transition-colors hover:bg-[#1a1d2e]/30"
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">{label}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{pc?.pc_number ?? pc?.hostname ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {proxy ? (
                        <span className="flex items-center gap-1.5 text-xs text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> 배정됨
                        </span>
                      ) : (
                        <span className="text-xs text-amber-400">미할당</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                      {proxy?.address ?? "—"}
                    </td>
                  </tr>
                );
              })}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-600">
                    등록된 기기 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-[#1e2130] px-4 py-2 text-xs text-slate-500">
            기기 {devices.length}대 · 미할당 {counts.unassignedDevices}대
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#1e2130] bg-[#12141d]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">호스트:포트</th>
                <th className="px-4 py-3">프로토콜</th>
                <th className="px-4 py-3">기기</th>
                <th className="px-4 py-3">실패</th>
                <th className="px-4 py-3">마지막 체크</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const st =
                  ST[p.status] ?? {
                    color: "text-slate-400",
                    label: p.status,
                    icon: AlertTriangle,
                  };
                const Icon = st.icon;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-[#1e2130]/50 transition-colors hover:bg-[#1a1d2e]/30"
                  >
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "flex items-center gap-1.5 text-xs",
                          st.color
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                      {p.address}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-[#1a1d2e] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                        {p.type || "http"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">
                      {p.device_id
                        ? (deviceLabelMap.get(p.device_id) ?? p.device_serial ?? p.device_id.slice(0, 8))
                        : (p.device_serial ? String(p.device_serial) : (
                            <span className="text-slate-600">미할당</span>
                          ))}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "font-mono text-xs",
                          (p.fail_count ?? 0) >= 3
                            ? "text-red-400"
                            : (p.fail_count ?? 0) > 0
                              ? "text-amber-400"
                              : "text-slate-500"
                        )}
                      >
                        {p.fail_count ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {timeSince(p.last_checked)}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleDelete(p.id)}
                        className="rounded p-1 text-slate-600 hover:bg-red-900/10 hover:text-red-400"
                        title="삭제"
                        aria-label="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-slate-600"
                  >
                    프록시 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-[#1e2130] px-4 py-2 text-xs text-slate-500">
            {filtered.length}개 표시 / {proxies.length}개 전체
          </div>
        </div>
      )}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="border-[#1e2130] bg-[#0f1117] text-slate-200 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              프록시 벌크 추가
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-slate-500">
            한 줄에 하나씩 입력. 형식: host:port 또는 host:port:user:pass
          </p>
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={8}
            placeholder={"1.2.3.4:1080\n5.6.7.8:8080"}
            className="border-[#1e2130] bg-[#12141d] font-mono text-xs text-slate-300"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkOpen(false)}
              className="border-[#1e2130] text-slate-400"
            >
              취소
            </Button>
            <Button
              onClick={handleBulkAdd}
              disabled={actionLoading === "bulk"}
              className="bg-primary hover:bg-primary/90"
            >
              {actionLoading === "bulk" ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1.5 h-3.5 w-3.5" />
              )}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const dot: Record<string, string> = {
    green: "bg-green-500",
    blue: "bg-blue-500",
    red: "bg-red-500",
    amber: "bg-amber-500",
  };
  return (
    <div className="rounded-lg border border-[#1e2130] bg-[#12141d] px-4 py-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <span
          className={cn("h-1.5 w-1.5 rounded-full", dot[color] ?? "bg-slate-500")}
        />
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-white">{value}</div>
    </div>
  );
}
