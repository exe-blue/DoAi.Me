# 5레이어·파이프라인 아키텍처

Agent 및 서버 플로우를 5개 레이어와 전역설정, 파이프라인 이벤트로 정리한 문서.  
상세 검증은 [agent-three-layers-verification.md](qa-reports/agent-three-layers-verification.md) 참고.

---

## 아키텍처 개요

| 레이어 | 목적 | Supabase 통신 |
|--------|------|----------------|
| **1. 하트비트** | 기기 등록, 정보 저장, 하트비트로 서버 연결 확인 | PC / 디바이스 / 하트비트 서버 전송 |
| **2. 파이프라인** | 채널 등록 → 1분마다 신규 영상 조회 → 영상/작업 데이터 수집 | channels, videos, task_queue |
| **3. Task_devices 생성/전달** | task 1건 생성 후 서버에서 등록 디바이스 수만큼 task_devices 생성·전달 | tasks, task_devices (DB 트리거/Edge) |
| **4. Task_devices 스케줄링** | PC가 task_devices 수신, 시청시간·액션·댓글 등 config 구체화, 로컬 스케줄러 배정, xiaowei 명령 | claim, 로컬 스케줄러, xiaowei |
| **5. 디바이스 실행** | PC → 스마트폰 명령 실행(시청, 댓글, 좋아요, 담기) | 디바이스 실행 / 디바이스 에러 (task_devices, execution_logs, RPC) |

---

## 1. 하트비트 레이어 (디바이스, PC)

- **구현**: agent/device/heartbeat.js, agent/core/supabase-sync.js, agent.js 3(Register PC), 8(Start heartbeat).
- **동작**: getPcId, batchUpsertDevices, pcs update, markOfflineDevices.

---

## 2. 파이프라인 레이어 (영상, 채널)

- **구현**: app/api/cron/sync-channels (1분), lib/sync-channels-runner.ts, lib/pipeline.ts createManualTask/createBatchTask.
- **동작**: monitored 채널 순회 → fetchRecentVideos → videos upsert → auto_collect 채널의 active 영상 중 task/queue 없는 것 task_queue enqueue. 동시에 올라온 영상은 제목 가나다 순 적용.
- **createManualTask**: UI 단일 영상 입력 시 사용. task 구조 동일.
- **최초 task 데이터**: 채널, 영상주소, 영상제목, 영상키워드(없으면 제목 복제). task 있으면 대기열만 저장.

---

## 3. Task_devices 생성 및 전달 레이어 (Tasks, Task_devices)

- **요구**: task → task_devices 전환은 Supabase(DB 트리거 또는 Edge Function)에서 등록 디바이스 수 N만큼 생성. tasks는 동시 1개만 유지.
- **구현**: runDispatchQueue에서 task 1건 생성 후, DB 트리거(또는 Edge Function)가 devices 테이블 조회해 task_devices N건 insert. config는 task.payload, task.video_id 등 기반.

---

## 4. Task_devices 스케줄링 레이어 (배정, 대기열)

- **요구**: (1) task_devices 수만큼 PC가 푸시 수신 (2) 시청시간·액션 확률로 config 구체화 (3) 터치좌표 포함 (4) 댓글 수만큼 OpenAI 사전 생성 (5) 사전데이터 서버 전송 후 **PC 클라이언트 로컬 스케줄러** 배정 (6) xiaowei 명령.
- **구현**: config는 서버(또는 디스패치 시)에서 채움. **스케줄러는 PC 클라이언트(에이전트 device-orchestrator)에 존재**. device-orchestrator가 claim → runTaskDevice 호출로 “작업 배정”.

- **PC 스케줄링 정책**: PC당 **최대 20대** 동시 실행(부하 제한). 한 대 끝나면 곧바로 다음 기기에 명령해 **항상 20대 유지**. 한 기기가 **20분** 안에 끝나지 않으면 타임아웃 → 에러 처리 → `fail_or_retry_task_device` 호출 후 다음 디바이스에 명령.

---

## 5. 디바이스 실행 레이어 (명령 실행, 로그 송신)

- **구현**: agent/task/task-executor.js runTaskDevice, _watchVideoOnDevice, insertExecutionLog(시작/완료/실패 및 주요 단계). device-orchestrator claim → complete_task_device / fail_or_retry_task_device.
- **상세 스펙**: [agent-three-layers-verification.md](qa-reports/agent-three-layers-verification.md) §3번 레이어 상세 스펙(Single Source of Truth) 참고.
- **config**: task_devices.config에 title, keyword, min/max_wait_sec, watch_min/max_pct, prob_*, comment_content, action_touch_coords 포함(트리거·pipeline _buildDeviceConfig). Step 0 랜덤 대기, 1-2 keyword||title 검색, 1-3 제목/URL 매칭 후 폴백, 2-2 6초 후 광고 스킵, 2-3 영상 길이×watch% 시청시간, 3-x comment_content 또는 CommentGenerator, 담기 스와이프 2회+담기 탭(action_touch_coords.save_add/담기 폴백).
- **로깅**: execution_logs에 execution_id=task_device_id, data에 task_id·task_device_id, 단계(step_0_wait, step_1_1_launch, step_1_2_1_3_search_enter, step_2_2_ad_skip, step_2_1_2_3_play_watch 등) 기록.
- **Xiaowei 3-retry**: 중요 adb/UI 호출은 _adbShellWithRetry(3회). 3회 실패 시 예외 전파 → orchestrator가 fail_or_retry_task_device 호출.

---

## 전역 설정

1. **모든 디바이스 제어는 xiaowei 경유(adb, js)** — agent는 xiaowei만 사용.
2. **모든 이벤트는 시간순 오래된 것 우선** — task_queue dequeue, task_devices claim 시 created_at ASC.
3. **영상 최소 시청 20%, 최대 시청 95%** — lib/pipeline.ts DEFAULT_VARIABLES 및 _buildDeviceConfig 기본값.

---

## 파이프라인 이벤트

| # | 내용 | 구현 |
|---|------|------|
| 1 | 채널 등록 후 1분마다 신규 영상 조회. 올라오면 task 생성(createBatchTask 경로). 동시에 올라온 경우 가나다 순. | runSyncChannels → task_queue enqueue; runDispatchQueue에서 task 생성. 가나다 = 제목 기준 정렬. |
| 2 | createManualTask = UI 단일 영상 입력. task 항목 동일. | lib/pipeline.ts createManualTask. |
| 3 | 최초 tasks 생성 시 채널, 영상주소, 제목, 키워드 등록. 키워드 없으면 제목 복제. task 있으면 대기열만 저장. | sync 시 getTaskByVideoId 확인, task_config에 channel, video_url, title, keyword. |
| 4 | runDispatchQueue가 task_devices 생성·전달 시, 동시 실행 가능 기기 수를 반영해 영상 대기열 순서 배정. | task 1건 생성 후 DB/Edge에서 devices 수만큼 task_devices 생성. |

**채널 단위**: 채널별 수집 영상, 최근 영상 시간, 작업한 영상 조회수 → 1분마다 수집 (runSyncChannels 채널 루프).

---

## 구현 검증 (2026-03-01)

아래는 문서의 5레이어·전역설정·파이프라인 이벤트가 **현재 코드베이스에서 어떻게 반영되었는지** 검증한 결과입니다.

### 레이어별 구현 상태

| 레이어 | 반영 여부 | 구현 위치 | 비고 |
|--------|-----------|-----------|------|
| **1. 하트비트** | ✅ 반영됨 | agent/device/heartbeat.js, agent/core/supabase-sync.js, agent.js (PC 등록·하트비트 시작) | getPcId, batchUpsertDevices, pcs update, markOfflineDevices |
| **2. 파이프라인** | ✅ 반영됨 | app/api/cron/sync-channels/route.ts (1분), lib/sync-channels-runner.ts, lib/pipeline.ts | runSyncChannels → task_queue enqueue. 동시 신규 영상: created_at ASC 후 제목 가나다( order_key + localeCompare ko ). createManualTask 유지. |
| **3. Task_devices 생성/전달** | ✅ 반영됨 | lib/dispatch-queue-runner.ts, lib/pipeline.ts createBatchTask, DB 트리거 fn_create_task_devices_on_task_insert | createBatchTask는 **task 1건만** insert. task_devices는 트리거가 devices 조회 후 N건 insert (최신: PC별 1개 제한 적용, 20260301000003). |
| **4. Task_devices 스케줄링** | ✅ 반영됨 | agent/device/device-orchestrator.js, lib/pipeline.ts _buildDeviceConfig, lib/comment-pregenerate.ts | claim → runTaskDevice. config는 서버(트리거·_buildDeviceConfig)에서 watch/확률·action_touch_coords 채움. 댓글 사전 생성: runDispatchQueue 후 generateAndFillCommentsForTask로 풀 생성·task_devices 배분. PC당 20대·20분 타임아웃·fail RPC. |
| **5. 디바이스 실행** | ✅ 반영됨 | agent/task/task-executor.js, agent/device/device-orchestrator.js | runTaskDevice, complete_task_device / fail_or_retry_task_device. comment_content 있으면 사용, 없으면 에이전트 CommentGenerator. |

### 전역 설정

| 항목 | 반영 여부 | 비고 |
|------|-----------|------|
| 모든 디바이스 제어 xiaowei 경유 | ✅ | agent는 xiaowei만 사용. |
| 이벤트 시간순 오래된 것 우선 | ✅ | dequeue_task_queue_item: discovered_run_id ASC, order_key ASC, created_at ASC. claim_task_devices_for_pc: created_at ASC. |
| 영상 최소 시청 20%, 최대 95% | ✅ | lib/pipeline.ts DEFAULT_VARIABLES watchMinPct 20, watchMaxPct 95. 트리거 기본값 20/95. |

### 파이프라인 이벤트

| # | 요구 | 반영 여부 |
|---|------|-----------|
| 1 | 1분마다 신규 영상 조회, createBatchTask 경로, 동시 영상 가나다 | ✅ runSyncChannels → task_queue enqueue; runDispatchQueue 또는 Agent QueueDispatcher가 task insert → 트리거가 task_devices 생성. 가나다: order_key + dequeue 정렬. |
| 2 | createManualTask = UI 단일 영상 | ✅ lib/pipeline.ts createManualTask. task만 insert, task_devices는 트리거에서 생성(worker_id 시 해당 worker devices만). |
| 3 | task 생성 시 채널·영상주소·제목·키워드, task 있으면 대기열만 | ✅ sync 시 getTaskByVideoId 확인 후 enqueue만. task_config에 channel, video_url, title, keyword. |
| 4 | task_devices 생성 시 동시 실행 가능 기기 수 반영 | ✅ 트리거가 devices 기준으로 N건 생성. 최신 마이그레이션에서 PC별 1개(비바쁜 PC만) 제한. |

### 디스패치 경로 정리

- **서버 주 경로**: Cron `/api/cron/dispatch-queue` → runDispatchQueue → dequeue_task_queue_item RPC → createBatchTask(task만) → tasks INSERT → **트리거** fn_create_task_devices_on_task_insert → task_devices N건.
- **에이전트 보조 경로**: QueueDispatcher _tick → task_queue 조회 → **tasks만** insert → 동일 트리거로 task_devices 생성. (task_devices는 에이전트가 생성하지 않음.)

### 구현 반영 (2026-03)

- **PC 스케줄링**: ✅ device-orchestrator `maxConcurrent` 기본값 **20**, `WATCH_TIMEOUT_MS` **20분**. 타임아웃 시 **fail_or_retry_task_device** RPC 호출 후 해당 기기 idle → 다음 디바이스에 명령.
- **댓글 사전 생성**: ✅ lib/comment-pregenerate.ts. runDispatchQueue 성공 후 generateAndFillCommentsForTask(영상 제목·본문 기준, N = min(100, totalDevices×(commentProb/100)×2)) 비동기 호출 → 풀 생성·task_devices에 comment_content·comment_status=ready 할당. 실패 시 에이전트 CommentGenerator fallback.
- **action_touch_coords**: ✅ lib/pipeline.ts _buildDeviceConfig 및 트리거(20260301000006)에서 payload.action_touch_coords 반영.
- **comment_content**: ✅ 트리거 20260301000006에서 payload.comment_content 포함. TaskVariables·TaskDeviceConfig에 comment_content 옵션.
- **타임아웃 Cron**: ✅ `/api/cron/timeout-tasks` 및 vercel.json cron(5분 주기). fn_timeout_tasks_and_task_devices 호출.
- **createManualTask 통일**: ✅ task만 insert, task_devices는 트리거에서만 생성.
- **30분 task / 20분 task_device 타임아웃**: DB 함수 fn_timeout_tasks_and_task_devices. 호출: Vercel Cron `/api/cron/timeout-tasks` 또는 pg_cron.
- **레이어 3 최종**: ✅ agent-three-layers-verification.md §3번 레이어 상세 스펙(Single Source of Truth). task_devices.config 전체 필드·실행 단계(0, 1-1~3-4)·execution_logs 단계 로깅·Xiaowei 3회 재시도 후 fail_or_retry_task_device.

---

## 빌드 계획 (구현 순서) — 완료

| 순서 | 항목 | 담당 코드 | 비고 |
|------|------|-----------|------|
| 1 | PC 스케줄링 (20대·20분·타임아웃 시 fail RPC) | agent/device/device-orchestrator.js, agent/agent.js | ✅ maxConcurrent 20, WATCH_TIMEOUT_MS 20분, 타임아웃 시 fail RPC |
| 2 | action_touch_coords | lib/pipeline.ts, 20260301000006_task_devices_trigger_action_touch_coords.sql | ✅ _buildDeviceConfig·트리거 _cfg에 필드 추가 |
| 3 | 타임아웃 Cron | app/api/cron/timeout-tasks/route.ts, vercel.json | ✅ 5분 주기, fn_timeout_tasks_and_task_devices 호출 |
| 4 | 댓글 사전 생성 (영상별 ~100개 풀, 본문·제목 기준) | lib/comment-pregenerate.ts, lib/dispatch-queue-runner.ts | ✅ N = min(100, totalDevices×(commentProb/100)×2), 풀 생성 후 task_devices 배분 |
| 5 | (선택) createManualTask 통일 | lib/pipeline.ts | ✅ task만 insert, task_devices는 트리거 |
| 6 | 문서 갱신 | 본 문서 | ✅ 미구현 → 구현 반영 섹션으로 정리 |
