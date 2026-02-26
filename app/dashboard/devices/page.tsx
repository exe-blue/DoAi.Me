"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import {
  Smartphone,
  Search,
  RefreshCw,
  Battery,
  Shield,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetcher, apiClient } from "@/lib/api";
import { toast } from "sonner";

interface Device {
  id: string;
  serial: string;
  worker_id: string | null;
  status: string | null;
  model: string | null;
  battery_level: number | null;
  last_seen: string | null;
  ip_intranet?: string | null;
  nickname?: string | null;
  android_version?: string | null;
  youtube_version?: string | null;
  xiaowei_serial?: string | null;
  tag_group?: string | null;
  proxy_id?: string | null;
}

interface Worker {
  id: string;
  pc_number?: string | null;
  hostname?: string | null;
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

const STATUS: Record<string, { color: string; label: string }> = {
  online: { color: "bg-green-500", label: "온라인" },
  busy: { color: "bg-blue-500", label: "작업중" },
  offline: { color: "bg-slate-600", label: "오프라인" },
  error: { color: "bg-red-500", label: "에러" },
};

function buildDevicesKey(workerId: string, status: string) {
  const params = new URLSearchParams();
  if (workerId && workerId !== "all") params.set("worker_id", workerId);
  if (status && status !== "all") params.set("status", status);
  const q = params.toString();
  return q ? `/api/devices?${q}` : "/api/devices";
}

function DevicesPageInner() {
  const searchParams = useSearchParams();
  const [workerFilter, setWorkerFilter] = useState(
    searchParams.get("worker_id") || "all",
  );
  const [statusFilter, setStatusFilter] = useState(
    searchParams.get("status") || "all",
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const devicesKey = buildDevicesKey(workerFilter, statusFilter);
  const {
    data: devicesData,
    error: devicesError,
    isLoading: devicesLoading,
    mutate: mutateDevices,
  } = useSWR<{ devices: Device[] }>(devicesKey, fetcher, {
    refreshInterval: 30_000,
  });

  const { data: workersData } = useSWR<{ workers: Worker[] }>(
    "/api/workers",
    fetcher,
  );

  const devices = devicesData?.devices ?? [];
  const workers = workersData?.workers ?? [];

  const pcName = (workerId: string | null) => {
    if (!workerId) return "—";
    const w = workers.find((w) => w.id === workerId);
    return w?.pc_number ?? w?.hostname ?? workerId.slice(0, 8);
  };

  const filtered = useMemo(() => {
    return devices.filter((d) => {
      if (statusFilter !== "all" && (d.status ?? "") !== statusFilter)
        return false;
      if (workerFilter !== "all" && d.worker_id !== workerFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          d.serial?.toLowerCase().includes(q) ||
          d.model?.toLowerCase().includes(q) ||
          (typeof d.ip_intranet === "string" &&
            d.ip_intranet.toLowerCase().includes(q)) ||
          pcName(d.worker_id)?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [devices, statusFilter, workerFilter, search, workers]);

  const counts = useMemo(
    () => ({
      total: devices.length,
      online: devices.filter((d) => d.status === "online").length,
      busy: devices.filter((d) => d.status === "busy").length,
      offline: devices.filter((d) => d.status === "offline").length,
      error: devices.filter((d) => d.status === "error").length,
    }),
    [devices],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">디바이스</h1>
          <p className="text-sm text-slate-500">{counts.total}대 등록</p>
        </div>
        <div className="flex gap-1.5">
          {Object.entries(STATUS).map(([k, v]) => (
            <span
              key={k}
              className="flex items-center gap-1 rounded-full border border-[#1e2130] bg-[#12141d] px-2.5 py-1 text-[10px]"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", v.color)} />
              <span className="text-slate-500">{v.label}</span>
              <span className="font-mono text-slate-300">
                {counts[k as keyof typeof counts] ?? 0}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="시리얼, 모델, IP, PC 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-[#1e2130] bg-[#12141d] pl-9 text-sm text-slate-300 placeholder:text-slate-600"
          />
        </div>
        <Select value={workerFilter} onValueChange={(v) => setWorkerFilter(v)}>
          <SelectTrigger className="w-32 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
            <SelectValue placeholder="PC" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 PC</SelectItem>
            {workers.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.pc_number ?? w.hostname ?? w.id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
          <SelectTrigger className="w-28 border-[#1e2130] bg-[#12141d] text-sm text-slate-300">
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

      {devicesError && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-center text-sm text-red-400">
          목록을 불러오지 못했습니다.{" "}
          <button
            type="button"
            onClick={() => mutateDevices()}
            className="underline hover:no-underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {devicesLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-t-xl" />
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#1e2130] bg-[#12141d]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#1e2130] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">시리얼</th>
                <th className="px-4 py-3">PC</th>
                <th className="px-4 py-3">모델</th>
                <th className="px-4 py-3">프록시</th>
                <th className="px-4 py-3">배터리</th>
                <th className="px-4 py-3">마지막 응답</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const st = STATUS[d.status ?? ""] ?? {
                  color: "bg-slate-600",
                  label: d.status ?? "—",
                };
                return (
                  <tr
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    className="cursor-pointer border-b border-[#1e2130]/50 transition-colors hover:bg-[#1a1d2e]/30"
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn("h-2 w-2 rounded-full", st.color)}
                        />
                        <span className="text-xs text-slate-400">
                          {st.label}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-300">
                      {d.serial}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {pcName(d.worker_id)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">
                      {d.model ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.proxy_id ? (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <Shield className="h-3 w-3" /> 연결
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">없음</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.battery_level != null ? (
                        <span
                          className={cn(
                            "flex items-center gap-1 text-xs",
                            d.battery_level < 20
                              ? "text-red-400"
                              : "text-slate-400",
                          )}
                        >
                          <Battery className="h-3 w-3" />
                          {d.battery_level}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {timeSince(d.last_seen)}
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
                    검색 결과 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="border-t border-[#1e2130] px-4 py-2 text-xs text-slate-500">
            {filtered.length}개 표시 / {devices.length}개 전체
          </div>
        </div>
      )}

      <DeviceDetailSheet
        deviceId={selectedId}
        workers={workers}
        onClose={() => setSelectedId(null)}
        onSaved={() => {
          mutateDevices();
          setSelectedId(null);
        }}
        onDeleted={() => {
          mutateDevices();
          setSelectedId(null);
        }}
      />
    </div>
  );
}

function DeviceDetailSheet({
  deviceId,
  workers,
  onClose,
  onSaved,
  onDeleted,
}: {
  deviceId: string | null;
  workers: Worker[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { data, error, isLoading, mutate } = useSWR<{ device: Device }>(
    deviceId ? `/api/devices/${deviceId}` : null,
    fetcher,
  );
  const device = data?.device;
  const pcName = (workerId: string | null) => {
    if (!workerId) return "—";
    const w = workers.find((w) => w.id === workerId);
    return w?.pc_number ?? w?.hostname ?? workerId.slice(0, 8);
  };

  const handleDelete = async () => {
    if (!deviceId) return;
    if (!confirm("이 디바이스를 삭제할까요?")) return;
    const res = await apiClient.delete(`/api/devices/${deviceId}`);
    if (res.success) {
      toast.success("삭제됨");
      onDeleted();
    }
  };

  return (
    <Sheet open={!!deviceId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[400px] border-[#1e2130] bg-[#0f1117] text-slate-200 sm:w-[440px]">
        {deviceId && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-white">
                <Smartphone className="h-5 w-5" />
                {isLoading
                  ? "로딩..."
                  : error
                    ? "오류"
                    : (device?.serial ?? deviceId.slice(0, 8))}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-6 space-y-4">
              {isLoading && (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}
              {error && (
                <p className="text-sm text-red-400">
                  상세를 불러오지 못했습니다.{" "}
                  <button
                    type="button"
                    onClick={() => mutate()}
                    className="underline"
                  >
                    다시 시도
                  </button>
                </p>
              )}
              {device && (
                <>
                  <DetailRow
                    label="상태"
                    value={
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            STATUS[device.status ?? ""]?.color ??
                              "bg-slate-600",
                          )}
                        />
                        {STATUS[device.status ?? ""]?.label ??
                          device.status ??
                          "—"}
                      </span>
                    }
                  />
                  <DetailRow label="PC" value={pcName(device.worker_id)} />
                  <DetailRow label="모델" value={device.model ?? "—"} />
                  <DetailRow
                    label="시리얼"
                    value={
                      <span className="font-mono text-[11px]">
                        {device.serial}
                      </span>
                    }
                  />
                  <DetailRow
                    label="IP"
                    value={
                      <span className="font-mono text-[11px]">
                        {typeof device.ip_intranet === "string"
                          ? device.ip_intranet
                          : "—"}
                      </span>
                    }
                  />
                  <DetailRow
                    label="배터리"
                    value={
                      device.battery_level != null
                        ? `${device.battery_level}%`
                        : "—"
                    }
                  />
                  <DetailRow
                    label="Android"
                    value={device.android_version ?? "—"}
                  />
                  <DetailRow
                    label="YouTube"
                    value={device.youtube_version ?? "—"}
                  />
                  <DetailRow
                    label="Xiaowei"
                    value={device.xiaowei_serial ?? "—"}
                  />
                  <DetailRow label="태그" value={device.tag_group ?? "—"} />
                  <DetailRow
                    label="마지막 응답"
                    value={timeSince(device.last_seen)}
                  />
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#1e2130] text-slate-400"
                      onClick={handleDelete}
                    >
                      삭제
                    </Button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={<div className="p-6">로딩 중...</div>}>
      <DevicesPageInner />
    </Suspense>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[#1e2130] pb-3">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-300">{value}</span>
    </div>
  );
}
