"use client";

import { create } from "zustand";
import { useAllTaskLogsBroadcast } from "@/hooks/use-realtime";
import type { LogEntry, LogLevel } from "@/lib/types";
import type { TaskLogRow } from "@/lib/supabase/types";

function mapTaskLogRow(row: TaskLogRow): LogEntry {
  return {
    id: row.id,
    timestamp: row.created_at,
    level: (row.status === "error" ? "error" : row.status === "success" ? "success" : "info") as LogLevel,
    source: row.action ?? "System",
    nodeId: row.worker_id ?? "",
    deviceId: row.device_serial,
    message: row.message ?? "",
  };
}

interface LogsState {
  logs: LogEntry[];
  loading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  fetch: (page?: number) => Promise<void>;
  appendLog: (log: LogEntry) => void;
}

export const useLogsStore = create<LogsState>((set) => ({
  logs: [],
  loading: false,
  error: null,
  page: 1,
  totalPages: 1,
  fetch: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch(`/api/logs?page=${page}&limit=100`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = (await res.json()) as {
        logs: TaskLogRow[];
        pagination: { page: number; totalPages: number };
      };
      set({
        logs: data.logs.map(mapTaskLogRow),
        page: data.pagination.page,
        totalPages: data.pagination.totalPages,
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
      logs: [log, ...state.logs].slice(0, 100), // Keep latest 100 logs
    }));
  },
}));

/**
 * Hook that combines Zustand store + Realtime subscription for all task logs
 * Use this in React components instead of useLogsStore directly
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
