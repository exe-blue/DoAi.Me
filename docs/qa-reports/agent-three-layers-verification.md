# DoAi.Me — 5레이어 아키텍처 검증 (Single Source of Truth)

요구사항 기준으로 **전체 5개 레이어**와 Supabase 통신·전역설정·파이프라인 이벤트가 코드에 명확히 대응하는지 검증한 결과입니다.

---

## 전역 설정 (Global Rules)

| 규칙 | 내용 | 구현 위치 |
|------|------|-----------|
| **모든 기기 명령은 Xiaowei 경유** | ADB·JS 명령 모두 `ws://127.0.0.1:22222/` WebSocket으로 전달 | `agent/core/xiaowei-client.js` |
| **이벤트 우선순위: 오래된 것 먼저** | task_queue dequeue, task_devices claim 모두 `created_at ASC` | `dequeue_task_queue_item` RPC, `claim_task_devices_for_pc` RPC |
| **영상 최소 시청 20%, 최대 시청 95%** | `DEFAULT_VARIABLES.watchMinPct = 20`, `watchMaxPct = 95` | `lib/pipeline.ts`, `_buildDeviceConfig` |

---

## 레이어 구조 개요

```
L1. 하트비트       → pcs, devices 등록·갱신
L2. 파이프라인     → channels, videos 수집 → task_queue enqueue
L3. Task_devices   → task_queue dequeue → tasks 생성 → (DB trigger) task_devices 생성
L4. 스케줄링       → claim_task_devices_for_pc → 로컬 스케줄러 → Xiaowei
L5. 디바이스 실행  → runTaskDevice → execution_logs, task_devices 상태 갱신
```

---

## 1. 레이어 1: 하트비트 레이어 (디바이스·PC 등록)

**기능**: 기기 등록, 디바이스 정보 저장, 하트비트로 서버 연결 확인.
**Supabase 통신**: `pcs` UPDATE / `devices` UPSERT / 하트비트 전송

| agent.js 단계 | 담당 모듈 | Supabase 동작 |
|---------------|-----------|----------------|
| 3. Register PC | `supabaseSync.getPcId()` | `pcs` 조회·삽입, pc_id·pcUuid 설정 |
| 8. Start heartbeat | `device/heartbeat.js startHeartbeat()` | 매 주기: `pcs` UPDATE (status, last_heartbeat), `devices` batchUpsert (serial_number, pc_id, status, model, battery_level, last_heartbeat), markOfflineDevices, syncDeviceTaskStates |
| (7) ADB reconnect | `adb-reconnect.js` | devices 상태·재연결 반영 |
| (14a) Device watchdog | `device-watchdog.js` | 에러 감지 시 broadcaster 알림 |

**결과**: 레이어 1 **완전 구현됨**. PC 등록 → 하트비트 루프에서 디바이스 목록·상태를 `pcs`, `devices`에 실시간 전송.

---

## 2. 레이어 2: 파이프라인 레이어 (채널·영상 수집)

**기능**: 채널 등록 후 1분마다 신규 영상 조회 → videos upsert → auto_collect 채널의 영상을 task_queue에 enqueue.
**Supabase 통신**: `channels` 조회, `videos` upsert, `task_queue` INSERT

| 모듈 | 동작 |
|------|------|
| `app/api/cron/sync-channels/route.ts` | Vercel Cron 1분마다 `runSyncChannels()` 호출 |
| `lib/sync-channels-runner.ts` | monitored 채널 순회 → `fetchRecentVideos` → videos upsert → `task_queue` INSERT |
| `lib/db/channels.ts` | `getAllChannels()` — is_monitored 채널 목록 조회 |

### 파이프라인 이벤트 상세

| # | 이벤트 | 구현 |
|---|--------|------|
| 1 | 채널 등록 후 1분마다 신규 영상 조회. 신규 영상이면 `task_queue` enqueue. 같은 sync 사이클에 동시에 올라온 경우 **제목 가나다 순** 처리. | `runSyncChannels` → `sortedByOldestThenTitle`(created_at ASC → `localeCompare('ko-KR')` ASC) → `tq.insert(insertRow)` |
| 2 | `createManualTask` — UI 단일 영상 입력 시 사용. task 구조 동일. | `lib/pipeline.ts createManualTask` |
| 3 | 최초 tasks 생성 시 **채널·영상주소·제목·키워드** 등록. 키워드 없으면 제목 복제. task가 이미 있으면 `task_queue`에만 저장. | `sync-channels-runner.ts`: `getTaskByVideoId` 존재 시 enqueue만. `insertRow.task_config = { videoId, channelId, video_url, title, keyword }` |
| 4 | `runDispatchQueue` — task_queue 1건 dequeue 후 `createBatchTask`로 task 생성. task_devices는 DB 트리거로 생성됨. | `lib/dispatch-queue-runner.ts` → `lib/pipeline.ts createBatchTask` |

### 채널별 1분 수집 항목

- 수집 영상 목록 (videos upsert)
- 최근 영상 업로드 시간 (videos.created_at)
- 영상 status, target_views, prob_like, prob_comment (auto_collect 채널)
- Round-robin 방식으로 5개 슬롯 중 1개 처리 (YouTube API 쿼터 절약)

---

## 3. 레이어 3: Task_devices 생성·전달 레이어

**기능**: task_queue 1건 → task 1건 생성 → 서버(DB 트리거)에서 등록 디바이스 수만큼 task_devices 자동 생성 → PC로 전달.
**Supabase 통신**: `task_queue` dequeue, `tasks` INSERT, `task_devices` INSERT (DB 트리거)

| 모듈 | 동작 |
|------|------|
| `lib/dispatch-queue-runner.ts` | task_queue 1건 atomic dequeue (`dequeue_task_queue_item` RPC) → `createBatchTask` 호출 |
| `lib/pipeline.ts createBatchTask` | `tasks` 테이블에 task 1건 INSERT만. task_devices insert 없음(트리거 위임). |
| DB 트리거 `fn_create_task_devices_on_task_insert` | tasks INSERT 후 `devices` 테이블 조회 → 디바이스 수 N만큼 `task_devices` 행 생성. config는 task.payload + video 정보로 구성. |
| DB 트리거 `fn_add_task_device_for_new_device` | devices INSERT(또는 heartbeat 신규 등록) 시 현재 running task 있으면 해당 task_id에 task_device 추가 생성. |
| DB job `fn_timeout_tasks_and_task_devices` | tasks 30분 타임아웃, task_devices 20분 타임아웃(또는 timeout_at 기준). |

### 단일 task 보장

`runDispatchQueue`는 실행 전 `tasks` 테이블에서 `status IN ('pending', 'running')` 건수를 확인. 1건 이상이면 디스패치 스킵. → **동시에 1개의 task만 존재**.

### task_devices.config 필드 (fn_build_task_device_config 기준)

```json
{
  "video_url": "https://www.youtube.com/watch?v={id}",
  "video_id": "{id}",
  "title": "{영상 제목}",
  "keyword": "{search_keyword 또는 제목}",
  "duration_sec": 300,
  "min_wait_sec": 1,
  "max_wait_sec": 5,
  "watch_min_pct": 20,
  "watch_max_pct": 95,
  "prob_like": 40,
  "prob_comment": 10,
  "prob_playlist": 5,
  "comment_content": null,
  "comment_status": "pending",
  "action_touch_coords": null,
  "timeout_at": "{ISO 8601}"
}
```

`comment_status`: `pending` (사전 생성 대기) / `ready` (OpenAI 생성 완료) / `fallback` (agent 실행 시 생성)

---

## 4. 레이어 4: Task_devices 스케줄링 레이어

**기능**: claim_task_devices_for_pc RPC로 해당 PC에 할당된 task_devices를 가져와, 로컬 스케줄러가 연결된 기기 수만큼 병렬로 Xiaowei 명령 진행.
**Supabase 통신**: `task_devices` claim (status: pending → running), heartbeat에서 watch_progress 동기화

| 모듈 | 동작 |
|------|------|
| `agent/device/device-orchestrator.js` | `claim_task_devices_for_pc` RPC (폴백: UUID, legacy) → `runTaskDevice` 호출 |
| `claim_task_devices_for_pc` RPC | `ORDER BY created_at ASC` — 오래된 task_device 먼저 claim |
| 로컬 스케줄러 | 기기 수만큼 병렬 실행. `ORCHESTRATE_INTERVAL_MS = 3000ms` 간격 폴링. |
| heartbeat | `syncDeviceTaskStates` — task_devices 상태·watch_progress를 주기적으로 서버에 동기화 |
| `WATCH_TIMEOUT_MS` | 30분 초과 시 orchestrator 단에서도 타임아웃 처리 |

---

## 5. 레이어 5: 디바이스 실행 레이어 (Single Source of Truth)

**기능**: 스케줄러 명령에 따른 PC → 스마트폰 명령 실행 (시청, 댓글, 좋아요, 담기).
**Supabase 통신**: `execution_logs` INSERT, `task_devices` UPDATE, `complete_task_device` / `fail_or_retry_task_device` RPC

| 모듈 | 동작 |
|------|------|
| `agent/task/task-executor.js runTaskDevice` | insertExecutionLog(start) → `_watchVideoOnDevice` → insertExecutionLog(completed/failed) |
| `complete_task_device` RPC | 성공 시 task_device status = completed, completed_at, duration_ms 기록 |
| `fail_or_retry_task_device` RPC | 실패 시 retry_count 증가, 최대 초과 시 status = failed |

### 5.1 사전전달 이벤트값 (task_devices.config → runTaskDevice 입력)

| # | 항목 | config 필드 |
|---|------|-------------|
| 1 | 유튜브 영상 — 제목, 키워드, 주소. 키워드 없으면 제목 복제. 최소·최대 대기시간. | `video_url`, `video_id`, `title`, `keyword`, `min_wait_sec`, `max_wait_sec` |
| 2 | 영상 시청 — 최소 시청 %, 최대 시청 %, 액션 확률(좋아요/댓글/담기). | `watch_min_pct` (20), `watch_max_pct` (95), `prob_like`, `prob_comment`, `prob_playlist` |
| 3 | 영상 액션 — 댓글 내용, 액션 터치 좌표(비율 기반). | `comment_content`, `comment_status`, `action_touch_coords` |
| 4 | 에러 및 로그 — 각 단계 실행 내역과 시간 기록. | `execution_logs` INSERT (start/completed/failed) |
| 5 | Xiaowei/API — 명령 무응답·에러 시 3회까지 재시도 후 상태 전이. | `_withRetry(fn, maxAttempts=3)`, `_adbShellWithRetry` |

### 5.2 실제 실행 프로세스

| 단계 | 내용 | 구현 |
|------|------|------|
| **0** | 각 단계마다 `min_wait_sec`~`max_wait_sec` 랜덤 대기 | `stepWait()` |
| **1-1** | 유튜브 앱 화면 진입 | `_launchYoutube()` |
| **1-2** | 검색바 클릭 → 키워드로 영상 검색 | `_searchVideo(keyword)` |
| **1-3** | 검색결과에서 제목·주소 일치 영상 진입 | `_selectVideo(title, video_url)` |
| **2-1** | 영상 재생 | `_playVideo()` |
| **2-2** | **6초 딜레이** 후 광고 스킵 진행 | `await sleep(6000)` → `_trySkipAd()` |
| **2-3** | 영상 전체 길이 파악 → `watch_min_pct`~`watch_max_pct` 사이 랜덤 시청 시간 확정 | `_resolveWatchDurationSec(cfg, durationSec)` |
| **2-4** | 댓글/좋아요/담기 확률에 따라 시청 중 액션 시간 배치 | personality 시스템 (`_buildPersonality`) |
| **3-1** | 액션 확정 여부에 따라 명령 수행 | `_engageActions(actions, cfg)` |
| **3-2** | 확률 결정 → 시청 최대 시간 이전에 액션 시간 설정 | 타임라인 기반 스케줄링 |
| **3-3 (좋아요)** | 좋아요 클릭 (`action_touch_coords` 또는 기본 좌표) | `_doLike(cfg)` |
| **3-4 (댓글)** | `comment_status=ready` → `comment_content` 사용. `pending` → OpenAI 실행 시 생성 후 입력. | `_doComment(cfg)` |
| **3-5 (담기)** | 명령 아이콘 위치에서 **좌로 스와이프 2회** 후 "담기" 아이콘 클릭. 폴백: "나중에 볼 동영상". | `_doSavePlaylist(cfg)` |

---

## 6. agent.js 단계 → 5레이어 매핑 요약

| 레이어 | agent.js 단계 | Supabase 항목 |
|--------|---------------|---------------|
| **1. 하트비트** | 3 (PC 등록), 8 (heartbeat), 7 (ADB reconnect), 14a (watchdog) | pcs, devices 서버 전송 |
| **2. 파이프라인** | Vercel Cron 1분 (서버), sync-channels-runner.ts | channels, videos, task_queue |
| **3. Task_devices 생성** | `runDispatchQueue` (서버) + DB 트리거 | tasks INSERT, task_devices N건 (트리거) |
| **4. 스케줄링** | 15b device orchestrator claim | task_devices claim, heartbeat 동기화 |
| **5. 디바이스 실행** | 15b orchestrator 실행, task-executor.js | execution_logs, complete/fail RPC |

---

## 7. 스키마 정리

| 테이블 | 마이그레이션 | 주요 컬럼 |
|--------|-------------|-----------|
| `task_queue` | `20260213_step12_task_queue_schedules.sql` | id, task_config(JSON), status, priority, video_id, order_key, discovered_run_id, source, dispatched_task_id |
| `tasks` | — | id, type, task_type, video_id, channel_id, payload, status, device_count |
| `task_devices` | — | id, task_id, device_serial, pc_id, config(JSON), status, retry_count, comment_status, timeout_at |
| `execution_logs` | `20260228110000_execution_logs.sql` | execution_id, device_id, status, data, details, level, message |
| `pcs` | — | id, name, status, last_heartbeat |
| `devices` | — | id, serial_number, pc_id, status, model, battery_level, last_heartbeat |

### 주요 DB 트리거·함수

| 트리거·함수 | 위치 | 동작 |
|------------|------|------|
| `fn_create_task_devices_on_task_insert` | tasks AFTER INSERT | devices 테이블 조회 → task_devices N건 INSERT |
| `fn_add_task_device_for_new_device` | devices AFTER INSERT | 현재 running task 있으면 task_device 추가 INSERT |
| `fn_timeout_tasks_and_task_devices` | 주기 job | tasks 30분, task_devices 20분(또는 timeout_at) 타임아웃 |
| `dequeue_task_queue_item` | RPC | FOR UPDATE SKIP LOCKED, ORDER BY created_at→order_key→id ASC |
| `claim_task_devices_for_pc` | RPC | ORDER BY created_at ASC, 해당 pc_id 기준 claim |
| `complete_task_device` | RPC | status=completed, completed_at, duration_ms 기록 |
| `fail_or_retry_task_device` | RPC | retry_count 증가, 최대 초과 시 status=failed |

---

## 8. 구현 상태 체크리스트

| 항목 | 상태 |
|------|------|
| watchMinPct 기본값 20, watchMaxPct 95 | ✅ `lib/pipeline.ts DEFAULT_VARIABLES` |
| 가나다(한국어) 정렬 — 동시 신규 영상 | ✅ `localeCompare('ko-KR')` in `sync-channels-runner.ts` |
| task_devices DB 트리거 생성 | ✅ `20260229000000_task_devices_on_task_insert_trigger.sql` |
| 신규 device 등록 시 task_device 추가 | ✅ `20260229000001_task_devices_on_device_insert_trigger.sql` |
| 단일 task 보장 (dispatch 조건) | ✅ `dispatch-queue-runner.ts` active task count check |
| tasks 30분, task_devices 20분 타임아웃 | ✅ `20260229000002_task_and_task_device_timeouts.sql` |
| comment_status 컬럼 + timeout_at | ✅ `20260301000001_task_devices_comment_status_timeout.sql` |
| dequeue oldest-first + order_key(가나다) | ✅ `20260301000006_dequeue_order_oldest_first.sql` |
| runTaskDevice execution_logs 기록 | ✅ `task-executor.js insertExecutionLog(start/completed/failed)` |
| Xiaowei 3회 재시도 | ✅ `_withRetry`, `_adbShellWithRetry` in `task-executor.js` |
| 6초 딜레이 후 광고 스킵 | ✅ `task-executor.js _watchVideoOnDevice` |
| 담기: 좌 스와이프 2회 → "담기" 클릭 | ✅ `task-executor.js _doSavePlaylist` |
| action_touch_coords 지원 | ✅ `task-executor.js` 각 액션 메서드 |
| comment_status=ready 시 사전 생성 댓글 사용 | ✅ `task-executor.js _doComment` |
| keyword 없으면 title 복제 | ✅ `sync-channels-runner.ts` keyword 폴백 로직 |
| claim_task_devices_for_pc oldest-first | ✅ RPC ORDER BY created_at ASC |
