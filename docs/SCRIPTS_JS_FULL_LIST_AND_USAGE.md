# agent/ 및 scripts/ 전체 JS 파일 나열 · 워크플로우 사용처 · 미사용/불필요 리스트

---

## A. agent/ 폴더 — 전체 JS 파일 (20개)

| # | 파일 경로 | 사용처 (워크플로우·API·에이전트) | 비고 |
|---|-----------|----------------------------------|------|
| 1 | agent/agent.js | 진입점. require하는 모든 하위 모듈을 순서대로 기동. | 메인 |
| 2 | agent/config.js | agent.js에서 require. SUPABASE_URL, SCRIPTS_DIR, pc_number 등 env 제공. | |
| 3 | agent/core/xiaowei-client.js | agent.js → TaskExecutor·ScriptVerifier 등에서 사용. adbShell, autojsCreate, uploadFile. | |
| 4 | agent/core/supabase-sync.js | agent.js. getPcId, devices upsert, claim_task_devices_for_pc, complete/fail RPC. | |
| 5 | agent/core/dashboard-broadcaster.js | agent.js. Supabase Realtime broadcast. | |
| 6 | agent/device/heartbeat.js | agent.js(8. Start heartbeat). device-serial-resolver 사용. | |
| 7 | agent/device/device-serial-resolver.js | heartbeat.js에서 require. connection_id ↔ serial. | |
| 8 | agent/device/device-orchestrator.js | agent.js. device-presets, screenshot-on-complete 사용. claim → runTaskDevice. | |
| 9 | agent/device/device-presets.js | agent.js(presets), device-orchestrator.js. | |
| 10 | agent/device/device-watchdog.js | agent.js. 디바이스 에러 감지. | |
| 11 | agent/device/adb-reconnect.js | agent.js. ADB 재연결. | |
| 12 | agent/device/screenshot-on-complete.js | device-orchestrator.js에서 takeScreenshotOnComplete. | |
| 13 | agent/task/task-executor.js | agent.js → DeviceOrchestrator에서 runTaskDevice. comment-generator 사용. view_farm/run_script 등 task_type 분기. **scriptPath 기본값 youtube_watch.js.** | **워크플로우**: view_farm은 스크립트 안 씀(_watchVideoOnDevice). run_script/script 시 payload.scriptPath 사용. |
| 14 | agent/task/stale-task-cleaner.js | agent.js. 만료 task_devices 정리. | |
| 15 | agent/scheduling/queue-dispatcher.js | agent.js. task_queue → tasks INSERT. | |
| 16 | agent/scheduling/schedule-evaluator.js | agent.js. task_schedules → task_queue INSERT. | |
| 17 | agent/setup/script-verifier.js | agent.js(11. Script verification). **REQUIRED_SCRIPTS = ["youtube_watch.js"]**, SCRIPTS_DIR, test_ping.js. | **워크플로우**: youtube_watch.js 존재 검증만. |
| 18 | agent/setup/comment-generator.js | task-executor.js. _watchVideoOnDevice에서 댓글 생성. | |
| 19 | agent/setup/proxy-manager.js | agent.js. | |
| 20 | agent/setup/account-manager.js | agent.js. | |

**워크플로우(DB)와의 관계**:  
- DB의 `workflows_definitions.steps`(scriptRef: yt/preflight, yt/search_title, yt/watch, yt/actions)는 **에이전트가 디바이스 스크립트 파일로 실행하지 않음.**  
- view_farm 실행은 task-executor의 `_watchVideoOnDevice`(adbShell/UI 제어)로만 처리.  
- 따라서 **agent/ 내 JS는 “워크플로우 step 실행”과 직접 연결된 파일 없음.** 전부 에이전트 런타임용.

---

## B. scripts/ 폴더 — 전체 JS 파일 (6개)

| # | 파일 경로 | 사용처 (워크플로우·API·에이전트) | 비고 |
|---|-----------|----------------------------------|------|
| 1 | scripts/youtube_watch.js | (1) **task-executor.js**: view_farm 시 payload.scriptPath 없으면 **기본값**으로 사용. 단, 현재 view_farm 기본 경로는 scriptPath 없이 _watchVideoOnDevice만 호출하므로 **실제로는 호출되지 않음.** (2) **script-verifier.js**: REQUIRED_SCRIPTS에 포함, 존재 여부 검증. (3) **run_script / script / custom** 타입에서 payload.scriptPath로 지정 시 사용. | 디바이스 스크립트. 단순 URL 열기 + watchDuration sleep. |
| 2 | scripts/youtube_commander.js | (1) **POST /api/youtube/command**: payload.script_path = "youtube_commander.js", task_type run_script. (2) **POST /api/youtube/pipeline**: 동일 script_path. (3) **app/api/youtube/deploy/route.ts**: ALLOWED_SCRIPTS.youtube_commander → "./scripts/youtube_commander.js" 배포. (4) **youtube_commander_run.js**: require('./youtube_commander.js'). | 디바이스 스크립트. cmd.json 기반 검색·시청·좋아요·댓글·담기. |
| 3 | scripts/youtube_commander_run.js | (1) **app/api/youtube/deploy/route.ts**: ALLOWED_SCRIPTS.youtube_commander_run → "./scripts/youtube_commander_run.js" 배포. (2) youtube_commander.js와 쌍으로 배포 시 진입점으로 사용. | 디바이스 스크립트. commander 진입점. |
| 4 | scripts/youtube-deploy-and-launch.js | **워크플로우/API/에이전트에서 호출 안 함.** 개발자 수동 실행: POST /api/youtube/deploy 후 POST /api/youtube/command 호출. | Node 유틸(배포·실행 테스트). |
| 5 | scripts/stress-test.js | **워크플로우/API/에이전트에서 호출 안 함.** 개발자 수동 실행: Xiaowei WS로 ADB 반복, 동시성·메모리 측정. | Node 유틸(스트레스 테스트). |
| 6 | scripts/smoke-test.js | **워크플로우/API/에이전트에서 호출 안 함.** 개발자 수동 실행: Supabase에 adb task 생성 후 완료 폴링. | Node 유틸(E2E 스모크). |

**DB 워크플로우(workflows_definitions.steps)와 scripts/ 파일 매핑**:  
- DB step의 scriptRef는 **scripts 테이블의 id**(예: a1000001-0000-4000-8000-000000000001)와 **name**(yt/preflight, yt/search_title, yt/watch, yt/actions)으로만 연결됨.  
- **scripts 테이블의 content**는 ESM 플레이스홀더(로그만 찍는 함수). **scripts/ 폴더의 파일명과 1:1 매핑되지 않음.**  
- 현재 에이전트는 이 4단계를 **디바이스 스크립트 파일로 실행하지 않음.**  
- 따라서 **워크플로우(DB) “어디에서” 사용되는 scripts/ 파일**: **없음.** (실제 실행 경로는 API/태스크 플로우만 해당.)

---

## C. 워크플로우 “어디에서” 사용되는지 요약

- **API/태스크에서 실제로 쓰는 scripts/ 파일**
  - **youtube_commander.js**: `/api/youtube/command`, `/api/youtube/pipeline`, `/api/youtube/deploy` (배포 대상).
  - **youtube_commander_run.js**: `/api/youtube/deploy` (배포 대상).
  - **youtube_watch.js**: task payload.scriptPath로 지정되거나, run_script/script/custom 타입에서만. view_farm 기본 경로에서는 **사용 안 함** (기본값으로만 이름이 나옴).

- **DB 워크플로우(workflows_definitions.steps)**
  - step의 scriptRef(yt/preflight, yt/search_title, yt/watch, yt/actions)는 **scripts 테이블**과만 연결됨.  
  - **scripts/ 폴더의 어떤 .js 파일도 이 워크플로우 step에 의해 실행되지 않음.**

---

## D. 사용되지 않은 것 / 불필요한 것 리스트

### D.1 워크플로우·실행 경로에서 전혀 호출되지 않는 것

| 파일 | 구분 | 설명 |
|------|------|------|
| scripts/youtube-deploy-and-launch.js | Node 유틸 | 워크플로우·API·에이전트에서 자동 호출 없음. 수동 배포/실행 테스트용. **불필요하다고 보기 어렵음** (의도된 유틸). |
| scripts/stress-test.js | Node 유틸 | 동일. 수동 스트레스 테스트용. **불필요하다고 보기 어렵음**. |
| scripts/smoke-test.js | Node 유틸 | 동일. 수동 스모크용. **불필요하다고 보기 어렵음**. |

### D.2 현재 실행 경로에서 사실상 미사용(호출되지 않음)

| 파일 | 구분 | 설명 |
|------|------|------|
| **scripts/youtube_watch.js** | 디바이스 스크립트 | view_farm 기본 경로는 _watchVideoOnDevice만 사용하므로 **이 파일을 타지 않음.** run_script/script/custom에서 scriptPath로 지정할 때만 사용. ScriptVerifier는 “필수”로 존재만 검사. **실제 플로우에서 미사용에 가깝이.** 제거 시 ScriptVerifier의 REQUIRED_SCRIPTS 수정 필요. |

### D.3 불필요하다고 정리할 수 있는 것(권장)

| 항목 | 권장 |
|------|------|
| **youtube_watch.js** | (1) 유지: run_script/scriptPath·검증용으로 남겨둠. (2) 제거: view_farm이 스크립트 안 쓰는 걸 전제로 “필수”에서 빼고, scriptPath 지정 시에만 사용하도록 문서화 후 필요 시 제거. |

**agent/ 쪽**: 모든 파일이 agent.js 또는 하위 모듈에서 require되어 사용됨. **미사용·불필요한 agent JS 파일 없음.**

---

## E. 참고: 워크플로우 관련 코드 위치

| 용도 | 위치 |
|------|------|
| DB 워크플로우 step 정의 (scriptRef) | supabase/migrations/20260227000000_release1_task_devices_scripts.sql, 20260226_103000_seed_workflows_and_scripts.sql |
| 워크플로우 로드·스냅샷·config 빌드 | lib/workflow-snapshot.ts (workflows 테이블, scriptRef, scripts 테이블 조회) |
| task_queue enqueue 시 workflow config | lib/sync-channels-runner.ts (buildConfigFromWorkflow) |
| dispatch 시 workflowId 전달 | lib/dispatch-queue-runner.ts |
| API: workflow CRUD | app/api/workflows/route.ts, app/api/workflows/[id]/route.ts |
| task 생성 시 workflow 참조 | app/api/tasks/route.ts, app/api/commands/route.ts, app/api/queue/route.ts |

에이전트는 **workflow snapshot을 task_devices.config에 넣기만 하고**, step별로 **scripts 테이블의 script id → 디바이스 스크립트 파일**을 실행하는 코드가 없음. view_farm은 항상 _watchVideoOnDevice 한 번에 처리.
