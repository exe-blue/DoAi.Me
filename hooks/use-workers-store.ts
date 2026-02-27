"use client";

import { useEffect, useRef } from "react";
import { create } from "zustand";
import { useBroadcast, useDevicesBroadcast } from "@/hooks/use-realtime";
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

interface BroadcastDevice {
  serial: string;
  status: string;
  model?: string;
  battery?: number;
}

interface WorkersState {
  nodes: NodePC[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  updateDevicesFromBroadcast: (workerId: string, devices: BroadcastDevice[]) => void;
}

export const useWorkersStore = create<WorkersState>((set, get) => ({
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
  updateDevicesFromBroadcast: (workerId: string, devices: BroadcastDevice[]) => {
    const { nodes } = get();
    const updatedNodes = nodes.map((node) => {
      if (node.id !== workerId) return node;

      const broadcastMap = new Map(devices.map((d) => [d.serial, d]));
      const matchedSerials = new Set<string>();

      const updatedDevices = node.devices.map((existing) => {
        const update = broadcastMap.get(existing.serial);
        if (update) {
          matchedSerials.add(existing.serial);
          return {
            ...existing,
            status: (update.status as DeviceStatus) || existing.status,
          };
        }
        return existing;
      });

      // Add new devices not yet in the store
      for (const [serial, d] of broadcastMap) {
        if (!matchedSerials.has(serial)) {
          updatedDevices.push({
            id: serial,
            serial,
            ip: "",
            status: (d.status as DeviceStatus) || "online",
            currentTask: null,
            nodeId: workerId,
            nickname: null,
          });
        }
      }

      return { ...node, devices: updatedDevices };
    });

    set({ nodes: updatedNodes });
  },
}));

/**
 * Hook that combines Zustand store + Realtime subscription for workers
 * Use this in React components instead of useWorkersStore directly
 */
export function useWorkersWithRealtime() {
  const store = useWorkersStore();
  const fetchRef = useRef(store.fetch);
  fetchRef.current = store.fetch;

  // room:workers — refetch on worker-level changes
  useBroadcast("room:workers", ["insert", "update", "delete"], () => {
    store.fetch();
  });

  // room:devices — incremental device status updates
  useDevicesBroadcast({
    onUpdate: (workerId, devices) => {
      store.updateDevicesFromBroadcast(workerId, devices);
    },
  });

  // Fallback: full refetch every 5 minutes
  useEffect(() => {
    const handle = setInterval(() => {
      fetchRef.current();
    }, 5 * 60 * 1000);
    return () => clearInterval(handle);
  }, []);

  return store;
}
