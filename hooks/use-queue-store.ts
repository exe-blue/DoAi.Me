"use client";

import { create } from "zustand";
import { toast } from "@/hooks/use-toast";

export interface QueueItem {
  id: string;
  task_config: Record<string, unknown>;
  priority: number;
  status: "queued" | "dispatched" | "cancelled";
  dispatched_task_id: string | null;
  created_at: string;
  dispatched_at: string | null;
  source?: "manual" | "channel_auto" | null;
}

interface QueueStats {
  queued: number;
  running: number;
}

interface QueueState {
  items: QueueItem[];
  stats: QueueStats;
  loading: boolean;
  fetch: (status?: string) => Promise<void>;
  add: (taskConfig: Record<string, unknown>, priority?: number) => Promise<void>;
  updatePriority: (id: string, priority: number) => Promise<void>;
  cancel: (id: string) => Promise<void>;
  bulkCancel: (ids: string[]) => Promise<void>;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  items: [],
  stats: { queued: 0, running: 0 },
  loading: false,

  fetch: async (status = "queued") => {
    set({ loading: true });
    try {
      const res = await fetch(`/api/queue?status=${status}&limit=100`);
      if (!res.ok) throw new Error("큐 목록을 불러오는데 실패했습니다");
      const data = await res.json();
      set({
        items: data.items ?? [],
        stats: data.stats ?? { queued: 0, running: 0 },
        loading: false,
      });
    } catch (err) {
      set({ loading: false });
      console.error("Queue fetch error:", err);
    }
  },

  add: async (taskConfig, priority = 0) => {
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_config: taskConfig, priority }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "큐에 추가하는데 실패했습니다");
      }
      await get().fetch();
      toast({ title: "큐에 추가됨", description: "작업이 큐에 추가되었습니다." });
    } catch (err) {
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "큐 추가 실패",
        variant: "destructive",
      });
      throw err;
    }
  },

  updatePriority: async (id, priority) => {
    try {
      const res = await fetch(`/api/queue/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) throw new Error("우선순위 변경 실패");
      set((state) => ({
        items: state.items.map((item) =>
          item.id === id ? { ...item, priority } : item
        ),
      }));
    } catch (err) {
      console.error("Priority update error:", err);
    }
  },

  cancel: async (id) => {
    try {
      const res = await fetch(`/api/queue/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("취소 실패");
      set((state) => ({
        items: state.items.filter((item) => item.id !== id),
        stats: { ...state.stats, queued: Math.max(0, state.stats.queued - 1) },
      }));
      toast({ title: "취소됨", description: "큐 항목이 취소되었습니다." });
    } catch (err) {
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "취소 실패",
        variant: "destructive",
      });
    }
  },

  bulkCancel: async (ids) => {
    try {
      const res = await fetch("/api/queue", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("일괄 취소 실패");
      const data = await res.json();
      await get().fetch();
      toast({
        title: "취소됨",
        description: `${data.cancelled}개 항목이 취소되었습니다.`,
      });
    } catch (err) {
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "일괄 취소 실패",
        variant: "destructive",
      });
    }
  },
}));
