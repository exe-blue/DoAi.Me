"use client";

import { create } from "zustand";
import { toast } from "@/hooks/use-toast";

export interface Schedule {
  id: string;
  name: string;
  cron_expression: string;
  task_config: Record<string, unknown>;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  created_at: string;
}

interface SchedulesState {
  schedules: Schedule[];
  loading: boolean;
  fetch: () => Promise<void>;
  create: (data: {
    name: string;
    cron_expression: string;
    task_config: Record<string, unknown>;
    is_active?: boolean;
  }) => Promise<void>;
  update: (
    id: string,
    data: Partial<{
      name: string;
      cron_expression: string;
      task_config: Record<string, unknown>;
      is_active: boolean;
    }>
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  trigger: (id: string) => Promise<void>;
  toggleActive: (id: string) => Promise<void>;
}

export const useSchedulesStore = create<SchedulesState>((set, get) => ({
  schedules: [],
  loading: false,

  fetch: async () => {
    set({ loading: true });
    try {
      const res = await fetch("/api/schedules");
      if (!res.ok) throw new Error("스케줄 목록을 불러오는데 실패했습니다");
      const data = await res.json();
      set({ schedules: data.schedules ?? [], loading: false });
    } catch (err) {
      set({ loading: false });
      console.error("Schedules fetch error:", err);
    }
  },

  create: async (data) => {
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "스케줄 생성 실패");
      }
      await get().fetch();
      toast({ title: "스케줄 생성됨", description: `"${data.name}" 스케줄이 생성되었습니다.` });
    } catch (err) {
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "스케줄 생성 실패",
        variant: "destructive",
      });
      throw err;
    }
  },

  update: async (id, data) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "스케줄 수정 실패");
      }
      await get().fetch();
      toast({ title: "스케줄 수정됨", description: "스케줄이 수정되었습니다." });
    } catch (err) {
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "스케줄 수정 실패",
        variant: "destructive",
      });
      throw err;
    }
  },

  remove: async (id) => {
    try {
      const res = await fetch(`/api/schedules/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("스케줄 삭제 실패");
      set((state) => ({
        schedules: state.schedules.filter((s) => s.id !== id),
      }));
      toast({ title: "스케줄 삭제됨", description: "스케줄이 삭제되었습니다." });
    } catch (err) {
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "스케줄 삭제 실패",
        variant: "destructive",
      });
    }
  },

  trigger: async (id) => {
    try {
      const res = await fetch(`/api/schedules/${id}/trigger`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "수동 실행 실패");
      }
      const data = await res.json();
      toast({
        title: "수동 실행됨",
        description: `"${data.schedule_name}" 스케줄이 큐에 추가되었습니다.`,
      });
    } catch (err) {
      toast({
        title: "오류",
        description: err instanceof Error ? err.message : "수동 실행 실패",
        variant: "destructive",
      });
    }
  },

  toggleActive: async (id) => {
    const schedule = get().schedules.find((s) => s.id === id);
    if (!schedule) return;
    await get().update(id, { is_active: !schedule.is_active });
  },
}));
