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

Track `prevSerials: Set<string>` and `errorCounts: Map<string, number>` across heartbeats. **영속성:** 에이전트 재시작 시 상태 손실을 막기 위해, 시작 시 prevSerials(및 선택적으로 errorCounts)를 DB 또는 로컬 파일에서 로드하고, 주기적 flush 또는 트랜잭션 업데이트로 유지. 오래된 항목은 정리하여 무한 증가 방지.

- Device in current list → `"online"`, `errorCounts[serial] = 0`
- Device missing + Xiaowei connected → `"error"`, `errorCounts[serial]++`
- Device missing + Xiaowei disconnected → `"offline"`
- Device in `"error"` and `errorCounts[serial] >= 2` → `"offline"` (confirmed disconnected)

**TOCTOU (Time-of-check to time-of-use):** "Device missing + Xiaowei connected → error" vs "Device missing + Xiaowei disconnected → offline" 분기에서, Xiaowei 연결 확인과 디바이스 목록 수집 사이에 상태가 바뀔 수 있음. 설계상 **호출 순서**를 고정한다: 항상 **먼저 Xiaowei 연결 여부 확인**, 그 다음 **디바이스 목록 수집** (또는 원자적 원격 API 한 번 호출로 병합). 두 값의 일관성은 같은 타이밍에 얻은 결과로 판단하며, 중간에 상태가 변경된 경우 처리 방침: **연결 상태 불확실 시 보수적으로 "offline" 처리** 또는 재시도/재검증 루틴 도입.

`syncDevices()` signature change:
```ts
async syncDevices(
  devices: XiaoweiDevice[],
  errorSerials?: string[]
): Promise<void>
```

Error serials get `status: "error"` instead of `"offline"`.

**syncDevices(devices, errorSerials?) when errorSerials === undefined:**  
`errorSerials`가 생략되면 이번 heartbeat를 "detection unavailable"으로 간주한다. 선택한 규칙: **이번 heartbeat에서는 error 전환을 수행하지 않고, 이전에 "error"였던 디바이스는 그대로 두거나, 정책에 따라 "offline"으로 전환** (문서화할 규칙: 예 — undefined 시 "error"였던 디바이스를 "offline"으로 전환하여 재검증 유도). DB 쓰기: undefined인 경우 errorSerials에 해당하는 업데이트는 하지 않으며, devices 목록만으로 online/offline 반영. 호출자는 이 규칙에 따라 결정적 결과를 예측할 수 있다.

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

**DB 마이그레이션 및 충돌 해결:**  
- **devices.status**에 `"error"` 값을 허용하도록 마이그레이션 (ENUM/CHECK 제약 추가 또는 허용 값 문서화). 기존 `null`/`"offline"` 레코드에 대한 backfill 전략 정의. **배포 순서:** DB 스키마 마이그레이션이 에이전트 배포보다 **먼저** 실행되도록 명시.  
- **증분 업데이트 vs 5분 폴백:** `updateDevicesFromBroadcast(workerId, devices[])`와 5분 full refetch 간 충돌 방지. 각 디바이스에 `lastUpdated`/`updatedAt` 또는 `version` 필드를 두고, 수신 항목의 타임스탬프(또는 버전)를 비교해 **더 최신 항목만 머지**. `useWorkersWithRealtime()`의 full refetch도 동일 비교 로직(또는 NodePC 단위 원자적 교체 규칙)을 따르며, 폴백이 최신 브로드캐스트를 덮어쓰지 않도록 한다.

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
| `agent/src/agent.ts` | `prevSerials` (및 `errorCounts`) tracking in heartbeat, error detection logic, 영속 로드/저장 |
| `agent/src/supabase-sync.ts` | `syncDevices()` error serials parameter, undefined 시 동작 명시 |
| `apps/dashboard/.../device-grid.tsx` | Event name `"device_batch"` → `"update"` |
| `hooks/use-realtime.ts` | New `useDevicesBroadcast()` hook |
| `hooks/use-workers-store.ts` | `updateDevicesFromBroadcast()` action, wiring, lastUpdated/버전 비교 |
| `agent/src/__tests__/broadcast.e2e.test.ts` | room:devices 테스트: 이벤트명 `"device_batch"` → `"update"` 반영, 디바이스 상태 `"error"` 전환 및 Xiaowei connected → missing → error → 2회 → offline 어설션 추가. 목/픽스처에서 `device_batch` 또는 이전 상태 참조를 `update` 및 `error` 포함으로 수정 |
