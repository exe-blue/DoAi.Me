# 플랜 반영 적용 보고서 — 2026-02-28

**참조 플랜**
- `docs/plans/2026-02-13-device-discovery-pipeline-plan.md`
- `docs/plans/2026-02-13-youtube-watch-task-plan.md`

**적용 범위:** 플랜에서 언급된 파일 중 **현재 코드베이스에 존재하는 파일**만 수정.  
(플랜은 `agent/src/*.ts`, `apps/dashboard/` 기준이었고, 실제 구조는 `agent/*.js`, 루트 `app/`·`hooks/` 이므로 해당 구조에 맞춰 반영.)

---

## 1. Device Discovery Pipeline 반영

### 1.1 Agent — error 감지 및 sync

| 파일 | 변경 내용 |
|------|-----------|
| **agent/core/supabase-sync.js** | `markOfflineDevices(pcId, activeSerials, errorSerials?)` 확장. 세 번째 인자 `errorSerials` 추가 시 해당 시리얼은 `status: "error"`로, 나머지 미연결 기기는 `"offline"`으로 갱신. |
| **agent/device/heartbeat.js** | `prevSerials`, `errorCountMap`, `ERROR_THRESHOLD = 2` 도입. 이전에 보였던 기기가 사라지면 2회 동안 `errorSerials`로 간주 후 `markOfflineDevices(pcId, activeSerials, errorSerials)` 호출. `room:devices` 브로드캐스트 호출 추가 (아래 1.2와 연동). |
| **agent/core/dashboard-broadcaster.js** | `room:devices` 채널 추가. `init()`에서 구독, `cleanup()`에서 제거. `broadcastWorkerDevices(workerId, devices)` 메서드 추가 — 이벤트명 `"update"`, payload `{ worker_id, devices }`. |

### 1.2 대시보드

- **hooks/use-realtime.ts**: 이미 `useDevicesBroadcast()` 및 이벤트 `"update"` 사용 중 → 변경 없음.
- **hooks/use-workers-store.ts**: 이미 `updateDevicesFromBroadcast`, `useWorkersWithRealtime`에서 `useDevicesBroadcast` 연동 → 변경 없음.
- **device-grid.tsx**: 플랜에는 `apps/dashboard/.../device-grid.tsx`가 있으나 현재 프로젝트에는 해당 경로 없음 → 적용 생략.

---

## 2. YouTube Watch Task Pipeline 반영

### 2.1 스크립트

| 파일 | 변경 내용 |
|------|-----------|
| **scripts/youtube_watch.js** | 주석만 정리. 파라미터가 `data/execArgv`로 전달됨을 명시 (동작은 기존과 동일). |

### 2.2 Agent

| 파일 | 변경 내용 |
|------|-----------|
| **agent/core/xiaowei-client.js** | `lastDevices` 프로퍼티 추가. `list()` 호출 시 응답을 파싱해 `this.lastDevices`에 저장하고, 기존처럼 raw 응답 반환. 플랜의 `executeYouTubeTask()` 등에서 디바이스 목록 폴백으로 사용 가능. |

**미적용 (구조 차이)**  
- 플랜의 `agent/src/agent.ts`, `executeYouTubeTask()`, `insertTaskDevice`/`updateTaskDevice`, `broadcastTaskProgress`는 현재 `agent/`가 CommonJS `.js` 구조이고 태스크 실행 경로가 다르므로, 이번 작업에서는 **반영하지 않음**. 필요 시 `agent/task/`, `agent/core/supabase-sync.js` 등 실제 진입점에 맞춰 별도 구현 필요.

### 2.3 대시보드

- **components/tasks-page.tsx**: 이미 RegisterTaskDialog에서 POST `/api/tasks`·`/api/queue` 호출 및 진행률 표시 구현됨 → 변경 없음.
- **lib/mappers.ts**: 이미 `calculateProgress(status, result)` 및 `result.done/failed/total` 기반 진행률 계산 구현됨 → 변경 없음.

---

## 3. 수정 파일 요약

| # | 파일 | 설명 |
|---|------|------|
| 1 | agent/core/supabase-sync.js | `markOfflineDevices`에 `errorSerials` 지원 추가 |
| 2 | agent/device/heartbeat.js | error 감지(prevSerials, errorCountMap), `room:devices` broadcast 호출 |
| 3 | agent/core/dashboard-broadcaster.js | `room:devices` 채널 및 `broadcastWorkerDevices()` 추가 |
| 4 | agent/core/xiaowei-client.js | `lastDevices` 및 list() 파싱 로직 추가 |
| 5 | scripts/youtube_watch.js | 주석 보완 |

---

## 4. 검증 제안

- **Agent**: `cd agent && node -e "require('./core/supabase-sync'); require('./core/dashboard-broadcaster'); require('./device/heartbeat'); require('./core/xiaowei-client'); console.log('OK');"`
- **대시보드**: `npx tsc --noEmit` (기존 hooks/use-realtime, use-workers-store 변경 없음)
- **이벤트 일치**: `room:devices` 이벤트명 `"update"`, payload `{ worker_id, devices }` — Agent broadcaster와 hooks/use-realtime.ts의 useDevicesBroadcast 일치 확인됨.

---

팀원은 위 파일들만 확인하면 플랜 반영 내용을 파악할 수 있습니다.
