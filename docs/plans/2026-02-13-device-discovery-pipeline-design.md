# Device Discovery Pipeline — Unified Real-time Design

**Date:** 2026-02-13
**Status:** Approved
**Approach:** B — 통합 실시간 경로 (Unified Real-time Path)
**Target:** TS Agent (`agent/src/`) + Current Dashboard (`components/`, `hooks/`)

## Problem

디바이스 디스커버리 파이프라인에 3가지 갭이 존재:

1. **Broadcast 이벤트명 불일치** — agent sends `"update"`, `device-grid.tsx` expects `"device_batch"`
2. **Error 상태 미구현** — agent only sets `"online"` / `"offline"`, no `"error"` detection
3. **현재 대시보드 실시간 미구독** — `devices-page.tsx` relies on `room:workers` refetch (up to 30s delay)

## Success Criteria

```
[Agent] 발견된 디바이스: 20대
[Agent] DB 등록 완료: PC01-001 ~ PC01-020
[Dashboard] 디바이스 그리드에 20대 표시 (녹색)
```

- Xiaowei `list` → 20 serials parsed
- `devices` table: 20 rows with `status=online`, correct `worker_id`
- Dashboard: 20 green devices within 1 heartbeat cycle
- Disconnected device → `error` within 2 heartbeats, then `offline`

## Design

### 1. Agent — Error State Detection

**File:** `agent/src/agent.ts` (heartbeat function)
**File:** `agent/src/supabase-sync.ts` (syncDevices)

Track `prevSerials: Set<string>` across heartbeats:

- Device in current list → `"online"`
- Device missing + Xiaowei connected → `"error"` (device-level problem: OTG, ADB auth)
- Device missing + Xiaowei disconnected → `"offline"` (infrastructure problem)
- Device in `"error"` for 2+ consecutive heartbeats → `"offline"` (confirmed disconnected)

`syncDevices()` signature change:
```ts
async syncDevices(
  devices: XiaoweiDevice[],
  errorSerials?: string[]
): Promise<void>
```

Error serials get `status: "error"` instead of `"offline"`.

### 2. Broadcast Event Name Alignment

**File:** `apps/dashboard/src/app/dashboard/components/device-grid.tsx`

Change line 128:
```ts
// Before:
channel.on("broadcast", { event: "device_batch" }, handleBroadcast);
// After:
channel.on("broadcast", { event: "update" }, handleBroadcast);
```

Agent `broadcaster.ts` already sends `"update"` — no agent-side change needed.

### 3. Dashboard Real-time Subscription

**File:** `hooks/use-realtime.ts` — Add `useDevicesBroadcast()` hook
**File:** `hooks/use-workers-store.ts` — Add incremental update action

New hook:
```ts
useDevicesBroadcast({
  onUpdate: (workerId, devices) => updateDevicesFromBroadcast(workerId, devices)
});
```

Store changes:
- New action `updateDevicesFromBroadcast(workerId, devices[])` — merges device changes into the matching NodePC
- `useWorkersWithRealtime()` wires both `room:workers` and `room:devices` subscriptions
- Fallback: full refetch every 5 minutes (Broadcast miss safety net)

### 4. Verification Plan

| Check | Method |
|---|---|
| TypeScript build | `npx tsc --noEmit` (agent + dashboard) |
| Event flow | agent event name == dashboard listener event name |
| Error transition | Xiaowei connected + device missing → error → 2x → offline |
| E2E test compat | `broadcast.e2e.test.ts` room:devices test passes |

## Out of Scope

- Legacy CJS agent (`agent/*.js`) — superseded by TS agent
- DB triggers for devices table — agent-side Broadcast is sufficient
- `devices-page.tsx` UI changes — only data source improvement
- Per-worker channel subscriptions (Approach C) — defer to 10+ PC scale

## Files to Modify

| File | Change |
|---|---|
| `agent/src/agent.ts` | `prevSerials` tracking in heartbeat, error detection logic |
| `agent/src/supabase-sync.ts` | `syncDevices()` error serials parameter |
| `apps/dashboard/.../device-grid.tsx` | Event name `"device_batch"` → `"update"` |
| `hooks/use-realtime.ts` | New `useDevicesBroadcast()` hook |
| `hooks/use-workers-store.ts` | `updateDevicesFromBroadcast()` action, wiring |
