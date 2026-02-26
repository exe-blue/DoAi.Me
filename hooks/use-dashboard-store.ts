"use client";

import { create } from "zustand";

interface WorkerSnapshot {
  id: string;
  name: string;
  status: string;
  uptime_seconds: number;
  last_heartbeat: string;
}

interface DevicesSnapshot {
  total: number;
  online: number;
  busy: number;
  error: number;
  offline: number;
}

interface TasksSnapshot {
  running: number;
  pending: number;
  completed_today: number;
  failed_today: number;
}

interface ProxiesSnapshot {
  total: number;
  valid: number;
  invalid: number;
  unassigned: number;
}

interface SystemEvent {
  event_type: string;
  message: string;
  details: any;
  timestamp: string;
}

export interface DashboardSnapshot {
  worker: WorkerSnapshot | null;
  devices: DevicesSnapshot;
  tasks: TasksSnapshot;
  proxies: ProxiesSnapshot;
  timestamp: string;
}

interface DashboardState {
  worker: WorkerSnapshot | null;
  devices: DevicesSnapshot;
  tasks: TasksSnapshot;
  proxies: ProxiesSnapshot;
  events: SystemEvent[];
  timestamp: string | null;
  loading: boolean;
  error: string | null;

  // Actions
  updateFromSnapshot: (snapshot: DashboardSnapshot) => void;
  addEvent: (event: SystemEvent) => void;
  fetchInitial: () => Promise<void>;
}

const initialDevices: DevicesSnapshot = {
  total: 0,
  online: 0,
  busy: 0,
  error: 0,
  offline: 0,
};

const initialTasks: TasksSnapshot = {
  running: 0,
  pending: 0,
  completed_today: 0,
  failed_today: 0,
};

const initialProxies: ProxiesSnapshot = {
  total: 0,
  valid: 0,
  invalid: 0,
  unassigned: 0,
};

export const useDashboardStore = create<DashboardState>((set, get) => ({
  worker: null,
  devices: initialDevices,
  tasks: initialTasks,
  proxies: initialProxies,
  events: [],
  timestamp: null,
  loading: false,
  error: null,

  updateFromSnapshot: (snapshot: DashboardSnapshot) => {
    set({
      worker: snapshot.worker,
      devices: snapshot.devices,
      tasks: snapshot.tasks,
      proxies: snapshot.proxies,
      timestamp: snapshot.timestamp,
    });
  },

  addEvent: (event: SystemEvent) => {
    set((state) => ({
      events: [event, ...state.events].slice(0, 50), // Keep last 50 events
    }));
  },

  fetchInitial: async () => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/overview");
      if (!res.ok) {
        throw new Error("Failed to fetch overview data");
      }
      const data = await res.json();

      // Map API response to dashboard snapshot format
      const snapshot: DashboardSnapshot = {
        worker: data.worker || null,
        devices: data.devices || initialDevices,
        tasks: data.tasks || initialTasks,
        proxies: data.proxies || initialProxies,
        timestamp: new Date().toISOString(),
      };

      get().updateFromSnapshot(snapshot);
      set({ loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Unknown error",
        loading: false,
      });
    }
  },
}));
