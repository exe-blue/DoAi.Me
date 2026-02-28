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

- **요구**: (1) task_devices 수만큼 PC가 푸시 수신 (2) 시청시간·액션 확률로 config 구체화 (3) 터치좌표 포함 (4) 댓글 수만큼 OpenAI 사전 생성 (5) 사전데이터 서버 전송 후 로컬 스케줄러 배정 (6) xiaowei 명령.
- **구현**: config는 서버(또는 디스패치 시)에서 채움. device-orchestrator가 claim → runTaskDevice 호출로 “작업 배정”.

---

## 5. 디바이스 실행 레이어 (명령 실행, 로그 송신)

- **구현**: agent/task/task-executor.js runTaskDevice, _watchVideoOnDevice, insertExecutionLog. device-orchestrator claim → complete_task_device / fail_or_retry_task_device.
- **상세 스펙**: [agent-three-layers-verification.md](qa-reports/agent-three-layers-verification.md) §3.1 참고.

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
