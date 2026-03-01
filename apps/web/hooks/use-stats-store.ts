import { create } from "zustand";

interface Stats {
  workers: { total: number; online: number };
  devices: { total: number; online: number; running: number; offline: number; error: number };
  tasks: { total: number; pending: number; running: number; completed: number; failed: number };
  channels: { total: number; monitoring: number };
}

interface StatsState {
  stats: Stats | null;
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

const defaultStats: Stats = {
  workers: { total: 0, online: 0 },
  devices: { total: 0, online: 0, running: 0, offline: 0, error: 0 },
  tasks: { total: 0, pending: 0, running: 0, completed: 0, failed: 0 },
  channels: { total: 0, monitoring: 0 },
};

export const useStatsStore = create<StatsState>((set) => ({
  stats: null,
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const stats = (await res.json()) as Stats;
      set({ stats, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },
}));
