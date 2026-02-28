# Agent JS 모듈 정의 및 5레이어 호출 흐름

**현재 프로세스:** `agent.js` 진입점에서 직접·간접 `require()` 되는 모듈만 `agent/`에 있음 (18개 파일). 나머지 레거시·스크립트·barrel·선택 모듈은 `_archive/agent-legacy/`로 이동됨 (2026-02-28). 상세 목록은 `_archive/agent-legacy/README.md` 참고.

이 문서는 **사용 중인 모듈**의 기능 정의와, **5레이어 아키텍처** 기준 호출 흐름을 정리한다.

---

## 1. JS 파일별 기능 정의 (현재 프로세스)

### 1.1 진입점·설정

| 파일 | 기능 |
|------|------|
| `agent.js` | Agent 부트스트랩. Core → Task → Heartbeat → Setup → Scheduling → DeviceOrchestrator 순 초기화, Realtime/설정 구독, Graceful shutdown. |
| `config.js` | .env 정적 설정 + DB `settings` 동적 설정 병합. Realtime 구독으로 설정 변경 시 `config-updated` 이벤트 발생(heartbeat/interval 등 live 반영). |

### 1.2 core/ — 외부 통신·동기화

| 파일 | 기능 |
|------|------|
| `core/xiaowei-client.js` | Xiaowei WebSocket 클라이언트(`ws://127.0.0.1:22222/`). list, adbShell, tap, goHome, actionCreate, autojsCreate 등. 자동 재연결, `connected`/`disconnected`/`error` 이벤트. |
| `core/supabase-sync.js` | Supabase 쿼리 + Realtime 구독 + 실행 로그 배치 파이프라인. PC 등록(getPcId), 디바이스 batch upsert, 오프라인 마킹(markOfflineDevices), execution_log 배치 flush(50건/3초). |
| `core/dashboard-broadcaster.js` | 대시보드용 실시간 이벤트 발행(Broadcast 채널). device/task 상태, 시스템 이벤트, 스냅샷 퍼블리시. |

### 1.3 device/ — 디바이스 제어·상태

| 파일 | 기능 |
|------|------|
| `device/heartbeat.js` | 주기(기본 30초) 루프: Xiaowei device list → devices 테이블 batch upsert, PC last_heartbeat 갱신, 오프라인 디바이스 마킹, orchestrator 상태 동기화, Reconnect/브로드캐스트 연동. |
| `device/device-orchestrator.js` | 디바이스별 상태(idle/watching/error 등) 추적. `claim_task_devices_for_pc`/`claim_next_task_device` RPC로 작업 선점 후 TaskExecutor.runTaskDevice 호출. 완료 시 complete_task_device / fail_or_retry_task_device RPC. |
| `device/device-presets.js` | Xiaowei 프리셋: scan, optimize, ytTest, warmup 등. device-orchestrator에서 free_watch 시 warmup 호출. |
| `device/device-watchdog.js` | 디바이스 오류율·일괄 오프라인 감지. 임계값 초과 시 broadcaster로 이벤트 발행. |
| `device/adb-reconnect.js` | 오프라인 디바이스에 ADB TCP 재연결 명령 전송(Xiaowei 경유). 재연결 주기·실패 카운트 관리. |

### 1.4 task/ — 태스크 실행

| 파일 | 기능 |
|------|------|
| `task/task-executor.js` | task_devices 1건 실행 엔진. task_type(preset/adb/direct/batch/youtube)에 따라 분기. YouTube: 검색→재생→시청시간 대기→좋아요/댓글/구독/재생목록. execution_log 삽입, complete/fail RPC는 orchestrator에서 호출. (인라인 + device-presets; youtube/ 모듈 미사용) |
| `task/stale-task-cleaner.js` | 기동 시·주기적으로 `running` 상태로 남은 task 복구(pending/failed로 리셋). 크래시 복구용. |

### 1.5 scheduling/ — 대기열·스케줄

| 파일 | 기능 |
|------|------|
| `scheduling/queue-dispatcher.js` | task_queue(queued) → 1건 원자 dequeue 후 tasks INSERT, task_queue를 dispatched로 갱신. Realtime INSERT 시 즉시 _tick, 30초 폴링 보조. |
| `scheduling/schedule-evaluator.js` | task_schedules 크론 평가(30초 주기). next_run_at 도래 시 task_queue에 1건 INSERT, last_run_at/next_run_at 갱신. |

### 1.6 setup/ — 프록시·계정·스크립트·댓글

| 파일 | 기능 |
|------|------|
| `setup/proxy-manager.js` | proxies 테이블에서 PC별 할당 로드 → Xiaowei로 디바이스에 SOCKS5/HTTP 프록시 적용. 주기 체크 루프. |
| `setup/account-manager.js` | accounts 테이블에서 할당 로드 → 디바이스별 YouTube 로그인 여부 검증. |
| `setup/script-verifier.js` | SCRIPTS_DIR 존재·필수 스크립트 존재·테스트 실행 확인. |
| `setup/comment-generator.js` | OpenAI API로 YouTube 댓글 문구 생성. task-executor에서 comment_status pending 시 fallback으로 사용. |

**기타(아카이브):** youtube/, dashboard/, proxy/, account/, adb/, common/, video-manager/ 전체 및 task·device의 barrel/미사용 모듈, 스크립트·패치류는 `_archive/agent-legacy/`에 보관. 목록은 `_archive/agent-legacy/README.md` 참고.

---

## 2. 5레이어 아키텍처와 JS 호출 흐름

아키텍처 문서(docs/architecture-five-layer-pipeline.md)의 5개 레이어별로, **명령이 일어나는 과정**과 그 과정에서 **호출되는 JS**를 정리한다.

```
레이어1(하트비트) → 레이어2(파이프라인·서버) → 레이어3(task_devices 생성) → 레이어4(스케줄링·배정) → 레이어5(디바이스 실행)
```

### 2.1 레이어 1 — 하트비트 (디바이스·PC 등록)

| 과정 | 담당 JS | 설명 |
|------|---------|------|
| PC 등록 | `core/supabase-sync.js` | `getPcId(pcNumber)` → pcs 조회/생성, pcId/pcUuid 저장. |
| 주기 디바이스 동기화 | `device/heartbeat.js` | `startHeartbeat()` → Xiaowei `list()` → `supabaseSync.batchUpsertDevices()`, `markOfflineDevices()`. |
| 오프라인 시 연쇄 회수 | `core/supabase-sync.js` | `markOfflineDevices()` 내부에서 `mark_device_offline` RPC 호출(좀비 task_devices 롤백). |
| PC/디바이스 상태 브로드캐스트 | `core/dashboard-broadcaster.js` | heartbeat 콜백에서 `publishDashboardSnapshot`, `broadcastWorkerDevices` 등 호출. |

**agent.js에서의 호출 순서:**  
SupabaseSync 생성 → `getPcId(config.pcNumber)` → Xiaowei 연결 → `startHeartbeat(xiaowei, supabaseSync, config, taskExecutor, broadcaster, reconnectManager, getDeviceOrchestrator)`.

---

### 2.2 레이어 2 — 파이프라인 (영상·채널·대기열)

서버(Next.js/Vercel)에서 수행. Agent의 JS는 **직접 호출되지 않음**.

| 과정 | 구현 위치(서버) | 비고 |
|------|------------------|------|
| 1분마다 채널 sync | `lib/sync-channels-runner.ts` → `runSyncChannels()` | 채널 순회, YouTube API, videos upsert, task_queue enqueue. |
| task_queue enqueue | 동일 | video_id, discovered_run_id, order_key, try_sync_lock 사용. |
| 디스패치(웹) | `lib/dispatch-queue-runner.ts` → `runDispatchQueue()` | `dequeue_task_queue_item` RPC → createBatchTask → task_queue dispatched 갱신. |

Agent 측에서는 **레이어 4**의 `queue-dispatcher.js`가 task_queue를 구독하고, **Agent가 task_queue에서 직접 dequeue해 tasks INSERT**하는 경로도 있음(아래 2.4).

---

### 2.3 레이어 3 — Task_devices 생성·전달

서버(DB 트리거) + 웹 디스패치. Agent JS는 **생성 로직을 갖지 않음**.

| 과정 | 구현 위치 | 비고 |
|------|------------|------|
| task 1건 생성 | 웹: `lib/pipeline.ts` createBatchTask / Agent: `scheduling/queue-dispatcher.js` _dispatchItem | tasks INSERT. |
| task_devices N건 생성 | DB 트리거 `fn_create_task_devices_on_task_insert` | tasks INSERT 후 트리거가 devices 조회해 task_devices INSERT(PC별 1개 제한 적용). |
| 신규 디바이스 시 1건 추가 | DB 트리거 `fn_add_task_device_for_new_device` | devices INSERT 시 **pending** task에만 task_device 1건 추가(late-join 정책 A). |

---

### 2.4 레이어 4 — Task_devices 스케줄링 (배정·대기열)

| 과정 | 담당 JS | 설명 |
|------|---------|------|
| task_queue → tasks 변환(Agent 측) | `scheduling/queue-dispatcher.js` | Realtime(task_queue INSERT) 또는 30초 폴링으로 _tick → queued 1건 선택 후 tasks INSERT, task_queue를 dispatched로 갱신. |
| task_schedules → task_queue | `scheduling/schedule-evaluator.js` | 30초마다 next_run_at 도래한 스케줄 확인 → task_queue에 INSERT. |
| task_devices claim | `device/device-orchestrator.js` | 3초마다 _orchestrate → idle 디바이스에 대해 `claim_task_devices_for_pc` / `claim_next_task_device` RPC 호출. |
| 작업 배정·실행 진입 | `device/device-orchestrator.js` | claim 성공 시 `taskExecutor.runTaskDevice(row)` 호출 → **레이어 5**로 진입. |

**정리:**  
- **queue-dispatcher.js**: task_queue(queued) → tasks 1건 생성(및 DB 트리거에 의한 task_devices 생성).  
- **schedule-evaluator.js**: task_schedules → task_queue enqueue.  
- **device-orchestrator.js**: task_devices claim → runTaskDevice 호출.

---

### 2.5 레이어 5 — 디바이스 실행 (명령 실행·로그)

| 과정 | 담당 JS | 설명 |
|------|---------|------|
| task_device 1건 실행 | `task/task-executor.js` | `runTaskDevice(taskDevice)` → config 기반 시청시간·액션 확률 해석, comment_status에 따른 댓글 사용/fallback. |
| YouTube 시청 플로우 | `task/task-executor.js` | `_watchVideoOnDevice()` → 검색/직접 URL, 재생, 시청 시간 대기, 좋아요/댓글/구독/재생목록(device-presets·_toAbsCoords fallback 사용). |
| Xiaowei 명령 전송 | `core/xiaowei-client.js` | task-executor가 `xiaowei.adbShell()`, `xiaowei.tap()`, `xiaowei.goHome()` 등 호출. |
| 실행 로그 | `core/supabase-sync.js` | task-executor가 `supabaseSync.insertExecutionLog()` 호출 → 배치 버퍼 적재 후 주기 flush. |
| 완료/실패 반영 | `device/device-orchestrator.js` | runTaskDevice 후 `complete_task_device` / `fail_or_retry_task_device` RPC 호출(CAS). |
| 프리셋(warmup 등) | `device/device-presets.js` | device-orchestrator가 free_watch 시 `presets.warmup()` 등 호출. |
| 댓글 fallback 생성 | `setup/comment-generator.js` | task-executor가 comment_status pending 시 `commentGenerator.generate()` 호출. |

---

## 3. 레이어별 호출 체인 요약

| 레이어 | 명령하는 과정 | 호출되는 agent JS (핵심만) |
|--------|----------------|----------------------------|
| **1** | PC 등록, 주기 디바이스·하트비트, 오프라인 연쇄 | `config.js` → `core/supabase-sync.js`, `core/xiaowei-client.js` → `device/heartbeat.js` → `core/dashboard-broadcaster.js`, `core/supabase-sync.js`(mark_device_offline) |
| **2** | 채널 sync, task_queue enqueue | (서버: sync-channels-runner, dispatch-queue-runner — Agent JS 없음) |
| **3** | task 1건 생성, task_devices N건 생성 | (서버/DB: pipeline, 트리거 — Agent에서는 queue-dispatcher가 tasks INSERT 시 트리거 유발) |
| **4** | task_queue→tasks(Agent), 스케줄→task_queue, claim→run | `scheduling/queue-dispatcher.js` → `scheduling/schedule-evaluator.js` → `device/device-orchestrator.js` |
| **5** | 시청·좋아요·댓글·구독·재생목록 실행, 로그, 완료/실패 RPC | `task/task-executor.js` → `core/xiaowei-client.js`, `core/supabase-sync.js`, `device/device-presets.js`, `setup/comment-generator.js` / `device/device-orchestrator.js`(RPC) |

---

## 4. agent.js 부팅 시 모듈 로드·시작 순서

1. config, XiaoweiClient, SupabaseSync  
2. Supabase 검증, getPcId (레이어 1)  
3. config.loadFromDB, config.subscribeToChanges  
4. Xiaowei 연결 대기  
5. TaskExecutor, StaleTaskCleaner (복구 + 주기 체크)  
6. DashboardBroadcaster  
7. AdbReconnectManager  
8. startHeartbeat (레이어 1 주기 동작)  
9. ProxyManager, AccountManager, ScriptVerifier (setup)  
10. AdbReconnectManager.start  
11. DeviceWatchdog.start  
12. QueueDispatcher.start, ScheduleEvaluator.start (레이어 4)  
13. DeviceOrchestrator.start (레이어 4·5 claim → run)  

이 순서대로 초기화되며, 각 레이어의 “명령하는 과정”에서 위 표의 JS가 호출된다.
