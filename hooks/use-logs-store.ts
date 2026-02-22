"use client";

import { create } from "zustand";
import { useAllTaskLogsBroadcast } from "@/hooks/use-realtime";
import type { LogEntry, LogLevel } from "@/lib/types";
import type { TaskLogRow } from "@/lib/supabase/types";

function mapTaskLogRow(row: TaskLogRow): LogEntry {
  return {
    id: row.id,
    timestamp: row.created_at ?? "",
    level: (row.level === "error" ? "error" : row.level === "warn" ? "warn" : "info") as LogLevel,
    source: row.action ?? "System",
    nodeId: row.worker_id ?? "",
    deviceId: row.device_serial ?? "",
    message: row.message ?? "",
  };
}

interface FetchOptions {
  taskId: string;
  level?: string;
  deviceId?: string;
  search?: string;
  before?: string;
  limit?: number;
}

interface LogsState {
  logs: LogEntry[];
  loading: boolean;
  error: string | null;
  currentTaskId: string | null;
  fetch: (options: FetchOptions) => Promise<void>;
  appendLog: (log: LogEntry) => void;
  clear: () => void;
}

export const useLogsStore = create<LogsState>((set) => ({
  logs: [],
  loading: false,
  error: null,
  currentTaskId: null,
  fetch: async ({ taskId, level, deviceId, search, before, limit = 200 }) => {
    set({ loading: true, error: null, currentTaskId: taskId });
    try {
      const params = new URLSearchParams({ task_id: taskId, limit: String(limit) });
      if (level) params.set("level", level);
      if (deviceId) params.set("device_id", deviceId);
      if (search) params.set("search", search);
      if (before) params.set("before", before);

      const res = await fetch(`/api/logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = (await res.json()) as { logs: TaskLogRow[] };
      set({
        logs: (data.logs ?? []).map(mapTaskLogRow),
        loading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },
  appendLog: (log) => {
    set((state) => ({
      logs: [log, ...state.logs].slice(0, 500),
    }));
  },
  clear: () => set({ logs: [], currentTaskId: null, error: null }),
}));

/**
 * Hook that combines Zustand store + Realtime subscription for all task logs.
 * Use this in React components instead of useLogsStore directly.
 */
export function useLogsWithRealtime() {
  const store = useLogsStore();

  useAllTaskLogsBroadcast({
    onLog: (logRow) => {
      const log = mapTaskLogRow(logRow);
      store.appendLog(log);
    },
  });

  return store;
}
