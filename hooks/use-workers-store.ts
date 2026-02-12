"use client";

import { create } from "zustand";
import { useBroadcast } from "@/hooks/use-realtime";
import type { NodePC, Device, DeviceStatus } from "@/lib/types";
import type { WorkerRow, DeviceRow } from "@/lib/supabase/types";

function mapDeviceRow(row: DeviceRow): Device {
  return {
    id: row.id,
    serial: row.serial,
    ip: (row.ip_intranet as string) ?? "",
    status: (row.status as DeviceStatus) || "offline",
    currentTask: row.current_task_id ?? "",
    nodeId: row.worker_id ?? "",
    nickname: row.nickname ?? null,
  };
}

function mapWorkerRow(row: WorkerRow, devices: DeviceRow[]): NodePC {
  return {
    id: row.id,
    name: row.hostname,
    ip: (row.ip_local as string) ?? "",
    status: row.status === "online" ? "connected" : "disconnected",
    devices: devices
      .filter((d) => d.worker_id === row.id)
      .map(mapDeviceRow),
  };
}

interface WorkersState {
  nodes: NodePC[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
}

export const useWorkersStore = create<WorkersState>((set) => ({
  nodes: [],
  loading: false,
  error: null,
  fetch: async () => {
    set({ loading: true, error: null });
    try {
      const [wRes, dRes] = await Promise.all([
        fetch("/api/workers"),
        fetch("/api/devices"),
      ]);
      if (!wRes.ok) throw new Error("Failed to fetch workers");
      if (!dRes.ok) throw new Error("Failed to fetch devices");

      const { workers } = (await wRes.json()) as { workers: WorkerRow[] };
      const { devices } = (await dRes.json()) as { devices: DeviceRow[] };

      const nodes = workers.map((w) => mapWorkerRow(w, devices));
      set({ nodes, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },
}));

/**
 * Hook that combines Zustand store + Realtime subscription for workers
 * Use this in React components instead of useWorkersStore directly
 */
export function useWorkersWithRealtime() {
  const store = useWorkersStore();

  useBroadcast("room:workers", ["insert", "update", "delete"], () => {
    // On any worker update, refetch workers and devices
    store.fetch();
  });

  return store;
}
