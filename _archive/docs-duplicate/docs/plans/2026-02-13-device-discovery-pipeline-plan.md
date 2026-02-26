# Device Discovery Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 3 gaps in the device discovery pipeline — event name mismatch, missing error detection, and missing real-time dashboard subscription.

**Architecture:** TS Agent heartbeat detects device status (online/error/offline) and broadcasts via `room:devices`. Dashboard subscribes to `room:devices` and incrementally updates the Zustand store. Both `device-grid.tsx` and `devices-page.tsx` receive real-time device data.

**Tech Stack:** TypeScript, Supabase Realtime Broadcast, Zustand 5, React 18

**Design Doc:** `docs/plans/2026-02-13-device-discovery-pipeline-design.md`

---

### Task 1: Agent — Add error detection to `syncDevices()`

**Files:**
- Modify: `agent/src/supabase-sync.ts:129-169` (syncDevices method)

**Step 1: Extend `syncDevices()` signature to accept error serials**

Add optional `errorSerials` parameter. Devices in this list get `status: "error"` instead of `"offline"`.

```ts
// agent/src/supabase-sync.ts — replace syncDevices method (lines 129-169)
async syncDevices(devices: XiaoweiDevice[], errorSerials?: string[]): Promise<void> {
  const now = new Date().toISOString();
  const activeSerials: string[] = [];
  const errorSet = new Set(errorSerials ?? []);

  for (const d of devices) {
    if (!d.serial) continue;
    activeSerials.push(d.serial);

    const { error } = await this.supabase.from("devices").upsert(
      {
        serial: d.serial,
        worker_id: this.workerId,
        status: "online" as DeviceStatus,
        model: d.model ?? d.name ?? null,
        battery_level: d.battery ?? null,
        ip_intranet: d.intranetIp || null,
        xiaowei_serial: d.onlySerial || null,
        screen_on: d.screenOn ?? null,
        last_seen: now,
      },
      { onConflict: "serial" }
    );

    if (error) {
      log.error(`Device upsert failed: ${d.serial}`, { error: error.message });
    }
  }

  // Mark missing devices: "error" if in errorSerials, "offline" otherwise
  if (activeSerials.length === 0 && errorSet.size === 0) {
    await this.supabase
      .from("devices")
      .update({ status: "offline" as DeviceStatus, last_seen: now })
      .eq("worker_id", this.workerId);
  } else {
    const allKnownSerials = [...activeSerials, ...errorSet];

    // Mark error devices
    if (errorSet.size > 0) {
      const errorArray = [...errorSet];
      await this.supabase
        .from("devices")
        .update({ status: "error" as DeviceStatus, last_seen: now })
        .eq("worker_id", this.workerId)
        .in("serial", errorArray);
    }

    // Mark remaining missing devices as offline
    if (allKnownSerials.length > 0) {
      await this.supabase
        .from("devices")
        .update({ status: "offline" as DeviceStatus, last_seen: now })
        .eq("worker_id", this.workerId)
        .not("serial", "in", `(${allKnownSerials.join(",")})`);
    }
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd agent && npx tsc --noEmit`
Expected: No errors (or only pre-existing errors)

**Step 3: Commit**

```bash
git add agent/src/supabase-sync.ts
git commit -m "feat(agent): add error serials support to syncDevices()"
```

---

### Task 2: Agent — Track previous serials and detect error state in heartbeat

**Files:**
- Modify: `agent/src/agent.ts:16` (add state variables)
- Modify: `agent/src/agent.ts:55-78` (heartbeat function)

**Step 1: Add state tracking above `heartbeat()` function**

After line 16 (`const runningTasks = new Set<string>();`), add:

```ts
let prevSerials = new Set<string>();
const errorCountMap = new Map<string, number>(); // serial → consecutive miss count
const ERROR_THRESHOLD = 2; // misses before downgrading error → offline
```

**Step 2: Replace heartbeat function with error detection logic**

Replace the `heartbeat()` function (lines 55-78) with:

```ts
async function heartbeat(): Promise<void> {
  try {
    let devices: XiaoweiDevice[] = [];
    if (xiaowei.connected) {
      try {
        devices = await xiaowei.list();
      } catch (err) {
        log.error("Failed to list devices", { error: (err as Error).message });
      }
    }

    const currentSerials = new Set(devices.map((d) => d.serial).filter(Boolean));

    // Determine error serials: previously seen, now missing, Xiaowei still connected
    const errorSerials: string[] = [];
    if (xiaowei.connected) {
      for (const serial of prevSerials) {
        if (!currentSerials.has(serial)) {
          const count = (errorCountMap.get(serial) ?? 0) + 1;
          errorCountMap.set(serial, count);
          if (count < ERROR_THRESHOLD) {
            errorSerials.push(serial);
          }
          // count >= ERROR_THRESHOLD: falls through to offline (not in errorSerials, not in activeSerials)
        }
      }
    }

    // Clear error counts for devices that came back
    for (const serial of currentSerials) {
      errorCountMap.delete(serial);
    }

    // Clean up error counts for devices that exceeded threshold
    for (const [serial, count] of errorCountMap) {
      if (count >= ERROR_THRESHOLD) {
        errorCountMap.delete(serial);
      }
    }

    prevSerials = currentSerials;

    // Supabase sync with error awareness
    await sync.updateWorkerHeartbeat(devices.length, xiaowei.connected);
    await sync.syncDevices(devices, errorSerials);

    // Broadcast
    await broadcaster.broadcastWorkerHeartbeat(devices.length, xiaowei.connected);
    await broadcaster.broadcastWorkerDevices(devices);

    log.info(`Heartbeat OK — ${devices.length} device(s), ${errorSerials.length} error(s), xiaowei=${xiaowei.connected}`);
  } catch (err) {
    log.error("Heartbeat error", { error: (err as Error).message });
  }
}
```

**Step 3: Verify TypeScript compiles**

Run: `cd agent && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add agent/src/agent.ts
git commit -m "feat(agent): detect device error state in heartbeat loop"
```

---

### Task 3: Dashboard — Fix event name in device-grid.tsx

**Files:**
- Modify: `apps/dashboard/src/app/dashboard/components/device-grid.tsx:128`

**Step 1: Change event name from `"device_batch"` to `"update"`**

Line 128, change:
```ts
// Before:
channel.on("broadcast", { event: "device_batch" }, handleBroadcast);
// After:
channel.on("broadcast", { event: "update" }, handleBroadcast);
```

**Step 2: Commit**

```bash
git add apps/dashboard/src/app/dashboard/components/device-grid.tsx
git commit -m "fix(dashboard): align device-grid broadcast event name to 'update'"
```

---

### Task 4: Dashboard — Add `useDevicesBroadcast()` hook

**Files:**
- Modify: `hooks/use-realtime.ts` (append new hook at end of file)

**Step 1: Add the hook after the existing `useBroadcast()` function (after line 219)**

```ts
/**
 * room:devices Broadcast 구독
 * Agent가 heartbeat마다 디바이스 상태를 room:devices로 전송
 */
export function useDevicesBroadcast(handlers: {
  onUpdate?: (workerId: string, devices: Array<{
    serial: string;
    status: string;
    model?: string;
    battery?: number;
  }>) => void;
}) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    channelRef.current = supabase
      .channel("room:devices")
      .on("broadcast", { event: "update" }, ({ payload }) => {
        const data = payload as {
          worker_id?: string;
          devices?: Array<{
            serial: string;
            status: string;
            model?: string;
            battery?: number;
          }>;
        };
        if (data?.worker_id && data?.devices) {
          handlersRef.current.onUpdate?.(data.worker_id, data.devices);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] Subscribed to room:devices");
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, []);
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add hooks/use-realtime.ts
git commit -m "feat(dashboard): add useDevicesBroadcast() hook for room:devices"
```

---

### Task 5: Dashboard — Add incremental device update to workers store

**Files:**
- Modify: `hooks/use-workers-store.ts` (add action + update `useWorkersWithRealtime`)

**Step 1: Add `updateDevicesFromBroadcast` action to the store interface and implementation**

Replace the entire `hooks/use-workers-store.ts` with:

```ts
"use client";

import { create } from "zustand";
import { useEffect, useRef } from "react";
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

      // Build a map of broadcast devices by serial
      const broadcastMap = new Map(devices.map((d) => [d.serial, d]));

      // Update existing devices and track which broadcast devices were matched
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
            id: serial, // temporary ID until next full fetch
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
 * Hook that combines Zustand store + Realtime subscription for workers.
 * Subscribes to both room:workers (worker changes) and room:devices (device updates).
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add hooks/use-workers-store.ts
git commit -m "feat(dashboard): incremental device updates via room:devices broadcast"
```

---

### Task 6: Verification — Build check and event flow audit

**Files:**
- Read-only verification across all modified files

**Step 1: Agent TypeScript build**

Run: `cd /home/choi/projects/doai.me/agent && npx tsc --noEmit`
Expected: Clean build or only pre-existing warnings

**Step 2: Dashboard TypeScript build**

Run: `cd /home/choi/projects/doai.me && npx tsc --noEmit`
Expected: Clean build or only pre-existing warnings

**Step 3: Event name audit**

Verify all broadcast producers and consumers use the same event name for `room:devices`:

| Component | File | Event |
|---|---|---|
| Agent producer | `agent/src/broadcaster.ts:35` | `"update"` |
| Dashboard consumer 1 | `apps/dashboard/.../device-grid.tsx:128` | `"update"` (fixed) |
| Dashboard consumer 2 | `hooks/use-realtime.ts` (new hook) | `"update"` (new) |

Run: `grep -n '"device_batch"\|"update"' agent/src/broadcaster.ts apps/dashboard/src/app/dashboard/components/device-grid.tsx hooks/use-realtime.ts`
Expected: Only `"update"` appears, no `"device_batch"`

**Step 4: Commit all verification notes (if any fixes were needed)**

```bash
git add -A && git commit -m "fix: address build/lint issues from device pipeline changes"
```

---

## Summary of Changes

| # | File | Lines Changed | Description |
|---|---|---|---|
| 1 | `agent/src/supabase-sync.ts` | ~40 | `syncDevices()` + error serials |
| 2 | `agent/src/agent.ts` | ~30 | heartbeat error detection |
| 3 | `apps/dashboard/.../device-grid.tsx` | 1 | event name fix |
| 4 | `hooks/use-realtime.ts` | ~40 | new `useDevicesBroadcast()` |
| 5 | `hooks/use-workers-store.ts` | ~60 | incremental update + wiring |

Total: ~170 lines across 5 files, 5 commits.
