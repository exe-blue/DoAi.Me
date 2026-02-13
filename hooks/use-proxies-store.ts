import { create } from "zustand";
import type { Proxy } from "@/lib/types";
import type { ProxyRow } from "@/lib/supabase/types";
import { toast } from "@/hooks/use-toast";

function mapProxyRow(row: ProxyRow): Proxy {
  return {
    id: row.id,
    address: row.address,
    type: (row.type ?? "socks5") as Proxy["type"],
    status: (row.status ?? "active") as Proxy["status"],
    workerId: row.worker_id,
    deviceId: row.device_id,
    createdAt: row.created_at ?? "",
  };
}

interface ProxiesState {
  proxies: Proxy[];
  loading: boolean;
  error: string | null;
  fetch: (workerId?: string) => Promise<void>;
  create: (proxy: {
    address: string;
    type?: string;
    worker_id?: string;
  }) => Promise<void>;
  bulkCreate: (lines: string[], type?: string, workerId?: string) => Promise<number>;
  bulkAssignToWorker: (workerId: string, count?: number) => Promise<number>;
  update: (
    id: string,
    fields: Partial<{
      address: string;
      type: string;
      status: string;
      worker_id: string | null;
    }>
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  assign: (proxyId: string, deviceId: string | null) => Promise<void>;
  autoAssign: (
    workerId: string
  ) => Promise<{ assigned: number; remaining: number }>;
}

export const useProxiesStore = create<ProxiesState>((set, get) => ({
  proxies: [],
  loading: false,
  error: null,
  fetch: async (workerId?: string) => {
    set({ loading: true, error: null });
    try {
      const url = workerId
        ? `/api/proxies?worker_id=${workerId}`
        : "/api/proxies";
      const res = await fetch(url);
      if (!res.ok) throw new Error("프록시 목록을 가져오는데 실패했습니다");
      const { proxies } = (await res.json()) as { proxies: ProxyRow[] };
      set({ proxies: proxies.map(mapProxyRow), loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "알 수 없는 오류",
        loading: false,
      });
    }
  },
  create: async (proxy) => {
    try {
      const res = await fetch("/api/proxies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proxy),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "프록시 생성에 실패했습니다");
      }
      await get().fetch();
      toast({
        title: "프록시 생성 완료",
        description: `프록시 "${proxy.address}"가 생성되었습니다`,
      });
    } catch (err) {
      toast({
        title: "오류",
        description:
          err instanceof Error ? err.message : "프록시 생성에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },
  bulkCreate: async (lines, type = "socks5", workerId?) => {
    try {
      const res = await fetch("/api/proxies/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxies: lines,
          type,
          worker_id: workerId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "프록시 일괄 등록에 실패했습니다");
      }
      const result = (await res.json()) as { inserted: number };
      await get().fetch();
      toast({
        title: "프록시 일괄 등록 완료",
        description: `${result.inserted}개의 프록시가 등록되었습니다`,
      });
      return result.inserted;
    } catch (err) {
      toast({
        title: "오류",
        description:
          err instanceof Error ? err.message : "프록시 일괄 등록에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },
  bulkAssignToWorker: async (workerId, count?) => {
    try {
      const res = await fetch("/api/proxies/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId, count }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "워커 일괄 배정에 실패했습니다");
      }
      const result = (await res.json()) as { updated: number };
      await get().fetch();
      toast({
        title: "워커 배정 완료",
        description: `${result.updated}개의 프록시가 배정되었습니다`,
      });
      return result.updated;
    } catch (err) {
      toast({
        title: "오류",
        description:
          err instanceof Error ? err.message : "워커 일괄 배정에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },
  update: async (id, fields) => {
    try {
      const res = await fetch(`/api/proxies/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "프록시 수정에 실패했습니다");
      }
      await get().fetch();
      toast({
        title: "프록시 수정 완료",
        description: "프록시가 수정되었습니다",
      });
    } catch (err) {
      toast({
        title: "오류",
        description:
          err instanceof Error ? err.message : "프록시 수정에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },
  remove: async (id) => {
    try {
      const res = await fetch(`/api/proxies/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "프록시 삭제에 실패했습니다");
      }
      await get().fetch();
      toast({
        title: "프록시 삭제 완료",
        description: "프록시가 삭제되었습니다",
      });
    } catch (err) {
      toast({
        title: "오류",
        description:
          err instanceof Error ? err.message : "프록시 삭제에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },
  assign: async (proxyId, deviceId) => {
    try {
      const res = await fetch("/api/proxies/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxy_id: proxyId, device_id: deviceId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "프록시 할당에 실패했습니다");
      }
      await get().fetch();
      toast({
        title: deviceId ? "프록시 할당 완료" : "프록시 할당 해제 완료",
        description: deviceId
          ? "기기에 프록시가 할당되었습니다"
          : "기기의 프록시 할당이 해제되었습니다",
      });
    } catch (err) {
      toast({
        title: "오류",
        description:
          err instanceof Error ? err.message : "프록시 할당에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },
  autoAssign: async (workerId) => {
    try {
      const res = await fetch("/api/proxies/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worker_id: workerId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "자동 할당에 실패했습니다");
      }
      const result = (await res.json()) as {
        assigned: number;
        remaining_unassigned_devices: number;
      };
      await get().fetch();
      toast({
        title: "자동 할당 완료",
        description: `${result.assigned}개의 프록시가 할당되었습니다. 남은 미할당 기기: ${result.remaining_unassigned_devices}개`,
      });
      return {
        assigned: result.assigned,
        remaining: result.remaining_unassigned_devices,
      };
    } catch (err) {
      toast({
        title: "오류",
        description:
          err instanceof Error ? err.message : "자동 할당에 실패했습니다",
        variant: "destructive",
      });
      throw err;
    }
  },
}));
