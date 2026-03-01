# agent/ 및 scripts/ JS 파일 분류 (워크플로우·미사용·중복)

Windows 클라이언트(에이전트)가 순서대로 실행하는 JS와, Xiaowei에 지시·API로 결과를 주고받는 스크립트를 구분한 문서.

---

## 1. 개념 정리

| 구분 | 설명 |
|------|------|
| **agent/** | Windows PC에서 실행되는 **Node.js 오케스트레이션 코드**. Xiaowei WebSocket·Supabase와 통신하며, task 수신 → 디바이스에 명령 전달 → 결과 보고. **디바이스로 배포되지 않음.** |
| **scripts/** | (1) **디바이스 스크립트**: `/sdcard/scripts/`에 배포되어 Xiaowei(AutoJS)가 **Android에서** 실행. (2) **Node 유틸**: PC 또는 개발 머신에서만 실행되는 테스트/배포 스크립트. |
| **워크플로우** | (A) **DB 워크플로우**: `workflows_definitions.steps`의 `scriptRef`(yt/preflight, yt/watch 등) — 현재 에이전트는 이 단계를 **디바이스 스크립트 파일로 실행하지 않음**. view_farm은 `_watchVideoOnDevice`(adbShell/UI 제어)로 처리. (B) **API/태스크 플로우**: task_type별로 어떤 스크립트/경로를 쓰는지. |

---

## 2. agent/ 폴더 — 전부 에이전트 런타임에서 사용

모두 **워크플로우(DB steps)와 무관**하게, 에이전트 기동·동작에 필수 또는 선택으로 사용됨. “디바이스에서 돌리는 스크립트”가 아님.

| 파일 | 역할 (코드 기준) | 워크플로우 사용 |
|------|------------------|-----------------|
| **agent.js** | 진입점. 설정 검증 → Xiaowei 연결 → PC 등록 → 하트비트 → 디바이스 오케스트레이터·태스크 실행·큐 디스패처·스케줄 평가·스크립트 검증 등 순서대로 기동. | 해당 없음 (에이전트 메인) |
| **config.js** | 환경 변수(SUPABASE_URL, SCRIPTS_DIR, pc_number 등) 읽어 설정 객체 제공. | 해당 없음 |
| **core/xiaowei-client.js** | Xiaowei WebSocket 클라이언트. adbShell, autojsCreate, uploadFile 등 API 래핑·재연결. | 해당 없음 |
| **core/supabase-sync.js** | Supabase 클라이언트, getPcId, batchUpsertDevices, pcs/devices 갱신, markOfflineDevices, task_devices claim/complete/fail RPC, insertExecutionLog. | 해당 없음 |
| **core/dashboard-broadcaster.js** | Supabase Realtime Broadcast로 대시보드에 이벤트 푸시. | 해당 없음 |
| **device/heartbeat.js** | 주기 하트비트: pcs/devices 상태·last_heartbeat 갱신, markOfflineDevices, syncDeviceTaskStates. | 해당 없음 |
| **device/device-orchestrator.js** | claim_task_devices_for_pc → runTaskDevice 호출 → complete/fail RPC. “로컬 스케줄러” 역할. | 해당 없음 |
| **device/device-presets.js** | 프리셋 목록 로드(DB 또는 고정값). task 타입이 preset일 때 참조. | 해당 없음 |
| **device/device-watchdog.js** | 디바이스 에러 감지·broadcaster 알림. | 해당 없음 |
| **device/adb-reconnect.js** | ADB 재연결 로직. | 해당 없음 |
| **device/device-serial-resolver.js** | connection_id ↔ serial 매핑. | 해당 없음 |
| **device/screenshot-on-complete.js** | 태스크 완료 시 스크린샷 촬영. device-orchestrator.js에서 takeScreenshotOnComplete 호출. | 해당 없음 |
| **task/task-executor.js** | task_type별 실행: view_farm/watch_video → _watchVideoOnDevice 또는 autojsCreate(scriptPath); run_script/script → autojsCreate(scriptPath); adb, actionCreate 등. **scriptPath 기본값 `youtube_watch.js`.** | view_farm은 **스크립트 미사용**(내부 UI 제어). run_script/script 시 **scripts/ 파일 사용** |
| **task/stale-task-cleaner.js** | 만료/stale task_devices 정리. | 해당 없음 |
| **scheduling/queue-dispatcher.js** | task_queue 구독·폴링, queued → tasks INSERT(트리거가 task_devices 생성), queue 행 dispatched 갱신. | 해당 없음 |
| **scheduling/schedule-evaluator.js** | task_schedules 평가 → task_queue INSERT. | 해당 없음 |
| **setup/script-verifier.js** | SCRIPTS_DIR 존재·필수 스크립트(youtube_watch.js) 존재 확인, test_ping.js autojsCreate 검증. | **youtube_watch.js** 필요로 함 |
| **setup/comment-generator.js** | OpenAI로 댓글 문구 생성. _watchVideoOnDevice에서 comment_content 없을 때 사용. | 해당 없음 |
| **setup/proxy-manager.js** | 프록시 할당/로테이션. | 해당 없음 |
| **setup/account-manager.js** | 계정 관리. | 해당 없음 |

**중복 여부**: agent 내부에는 동일 역할의 중복 파일 없음. 모두 모듈별 단일 역할.

---

## 3. scripts/ 폴더 — 디바이스 스크립트 vs Node 유틸

### 3.1 디바이스 스크립트 (Xiaowei AutoJS에서 실행)

| 파일 | 용도 (코드 분석) | 워크플로우/API 사용 | 비고 |
|------|------------------|----------------------|------|
| **youtube_watch.js** | 단순 시청: execArgv의 videoUrl로 intent 열고 watchDuration(ms)만큼 sleep. 광고 스킵·좋아요/댓글 없음. | (1) task_type이 run_script 또는 view_farm 이면서 payload.scriptPath가 지정될 때 사용. (2) ScriptVerifier가 “필수”로 체크. **단, 현재 view_farm 기본 경로는 scriptPath 없이 _watchVideoOnDevice만 사용하므로 이 파일을 타지 않음.** | 워크플로우(DB steps)와는 무관. “필수”는 검증용·scriptPath 지정 시 대비. |
| **youtube_commander.js** | AutoX/AutoJS용. 검색·재생·광고 스킵·좋아요·댓글·담기·구독 등 액션; cmd.json 또는 execArgv로 action/commands 수신 → result.json 저장. | **사용됨.** POST /api/youtube/command, /api/youtube/pipeline 에서 script_path: "youtube_commander.js" 로 태스크 생성. Agent가 cmd.json 업로드 후 autojsCreate로 실행. | DB 워크플로우 steps(yt/preflight 등)와 1:1 대응 아님. Commander 전용 플로우. |
| **youtube_commander_run.js** | 진입점만: `require('./youtube_commander.js')` 후 cmd.json/execArgv에 따라 실행. 배포 시 youtube_commander.js와 함께 /sdcard/scripts/에 둠. | **사용됨.** deploy API의 ALLOWED_SCRIPTS에 포함. autojsCreate 진입점으로 사용 가능. | youtube_commander.js와 쌍으로 배포. |

### 3.2 Node 전용 (디바이스로 배포 안 함)

| 파일 | 용도 (코드 분석) | 워크플로우 사용 | 비고 |
|------|------------------|-----------------|------|
| **youtube-deploy-and-launch.js** | 프로젝트 루트에서 실행. POST /api/youtube/deploy 호출 후 POST /api/youtube/command(launch 또는 get_state) 호출. 배포·실행 연계 테스트. | 사용 안 함 (개발/운영 유틸) | 미사용 아님. 수동 배포·검증용. |
| **stress-test.js** | Xiaowei WebSocket에 연결해 연결된 기기에 ADB(dump/parse/tap) 반복 전송. 동시성·응답·메모리 측정. | 사용 안 함 (테스트) | 미사용 아님. 스트레스 테스트 전용. |
| **smoke-test.js** | Supabase에 adb_shell 타입 task(echo ok) 생성 후 완료될 때까지 폴링. 에이전트 동작 스모크 검증. | 사용 안 함 (테스트) | 미사용 아님. E2E 스모크용. |

---

## 4. 워크플로우(DB)와의 관계

- **DB 워크플로우 steps**  
  `workflows_definitions`(예: WATCH_MAIN)의 steps에는 `scriptRef`로 다음 4개가 등록됨.  
  - yt/preflight  
  - yt/search_title  
  - yt/watch  
  - yt/actions  

  이 **이름**은 `scripts` 테이블의 `name`(yt/preflight 등)과 매핑되며, 테이블의 `content`는 ESM 플레이스홀더(로그만 찍는 함수)임.  
  **현재 에이전트는 view_farm 실행 시 이 4단계를 디바이스 스크립트 파일로 실행하지 않음.**  
  view_farm은 task_executor의 `_watchVideoOnDevice`(adbShell + UI 제어) 한 번에 처리됨.

- **실제 “워크플로우에서 사용되는” scripts/ 파일**  
  - **youtube_commander.js** (및 **youtube_commander_run.js**): API 플로우(배포 → cmd.json → autojsCreate)에서 사용.  
  - **youtube_watch.js**: task에 scriptPath가 명시되거나 run_script 타입일 때만 사용. view_farm 기본 경로에서는 미사용.

---

## 5. 미사용·중복 정리

### 5.1 미사용(워크플로우/태스크에서 안 쓰는 것)

- **agent/**  
  - **미사용 파일 없음.** 모든 모듈이 agent.js 또는 다른 모듈에서 require됨.  
  - (screenshot-on-complete.js는 agent.js에서 로드하는지 한 번 더 확인 권장.)

- **scripts/**  
  - **디바이스 스크립트**:  
    - **youtube_watch.js** — “필수”로만 쓰이고, **현재 view_farm 기본 경로에서는 호출되지 않음.** 즉 “실제 플로우에서 미사용”에 가깝고, scriptPath 지정·run_script·검증용으로만 사용됨.  
  - **Node 유틸**: youtube-deploy-and-launch.js, stress-test.js, smoke-test.js 는 워크플로우/태스크에서 호출되지 않지만, **의도된 테스트·배포 스크립트**이므로 “미사용”으로 제거 대상이 아님.

### 5.2 중복·기능 겹침

- **youtube_watch.js vs youtube_commander.js**  
  - **youtube_watch.js**: URL 열기 + 지정 시간 대기만. 단순 시청.  
  - **youtube_commander.js**: cmd.json 기반으로 검색·시청·좋아요·댓글·담기 등 풀 플로우.  
  → “영상 시청” 기능은 겹치지만, **진입 경로가 다름**(task scriptPath vs API command/pipeline). 동일 파일이 아님. 정리 시 “시청만 필요하면 youtube_watch.js, 풀 액션 필요하면 youtube_commander”로 역할 구분 가능.

- **agent/**  
  - 기능이 겹치는 중복 JS 파일 없음.

---

## 6. 각 JS 파일 요약 (직접 코드 분석한 내용)

### agent/

| 파일 | 한 줄 요약 |
|------|------------|
| agent.js | 진입점. 설정·Xiaowei·Supabase·하트비트·디스패처·오케스트레이터·태스크 실행·스크립트 검증 순서 기동. |
| config.js | process.env 기반 설정(scriptsDir, pcNumber, supabase URL/key 등). |
| core/xiaowei-client.js | ws 연결, adbShell/autojsCreate/uploadFile/actionCreate 등 Xiaowei 프로토콜 래핑. |
| core/supabase-sync.js | getPcId, devices upsert, claim_task_devices_for_pc, complete_task_device, fail_or_retry_task_device, insertExecutionLog. |
| core/dashboard-broadcaster.js | Supabase Realtime channel broadcast. |
| device/heartbeat.js | 주기적으로 pcs/devices last_heartbeat·status 갱신, markOfflineDevices. |
| device/device-orchestrator.js | claim_task_devices_for_pc RPC → TaskExecutor.runTaskDevice → complete/fail RPC. |
| device/device-presets.js | presets 목록 반환. |
| device/device-watchdog.js | 디바이스 이상 감지·broadcast. |
| device/adb-reconnect.js | ADB 재연결 처리. |
| device/device-serial-resolver.js | connection_id ↔ serial 해석. |
| device/screenshot-on-complete.js | 완료 시 스크린샷 등 후처리. |
| task/task-executor.js | task_type별 분기: view_farm → _watchVideoOnDevice 또는 autojsCreate(youtube_watch.js); run_script/script → autojsCreate(scriptPath); adb/actionCreate 등. _resolveScriptPath(SCRIPTS_DIR + scriptPath). |
| task/stale-task-cleaner.js | stale task_devices 상태 정리. |
| scheduling/queue-dispatcher.js | task_queue 조회/Realtime 구독, tasks INSERT, queue status 업데이트. |
| scheduling/schedule-evaluator.js | 스케줄 평가 → task_queue INSERT. |
| setup/script-verifier.js | SCRIPTS_DIR, REQUIRED_SCRIPTS(youtube_watch.js), test_ping.js autojsCreate. |
| setup/comment-generator.js | OpenAI 댓글 생성. |
| setup/proxy-manager.js | 프록시 할당/정책. |
| setup/account-manager.js | 계정 CRUD/할당. |

### scripts/

| 파일 | 한 줄 요약 |
|------|------------|
| youtube_watch.js | AutoJS: execArgv.videoUrl로 intent, watchDuration(ms) sleep. 단순 시청만. |
| youtube_commander.js | AutoJS: cmd.json/execArgv로 action 또는 commands 실행, result.json 저장. 검색·재생·광고 스킵·좋아요·댓글·담기·구독 등. |
| youtube_commander_run.js | Node/AutoJS 진입: require('youtube_commander.js') 후 동일 cmd.json/execArgv 로직. |
| youtube-deploy-and-launch.js | Node: /api/youtube/deploy 호출 후 /api/youtube/command(launch 또는 get_state) 호출. |
| stress-test.js | Node: Xiaowei WS로 ADB 반복 전송, 동시성·메모리 측정. |
| smoke-test.js | Node: Supabase에 adb task 생성 후 완료까지 폴링. |

---

## 7. 권장 정리

- **워크플로우에서 사용되는 것**: API/태스크 플로우 기준으로는 **youtube_commander.js**, **youtube_commander_run.js**. (DB steps의 yt/preflight 등은 현재 에이전트에서 디바이스 스크립트로 실행되지 않음.)
- **사용하지 않는 것**:  
  - **youtube_watch.js**는 view_farm 기본 경로에서 사용되지 않음. run_script·scriptPath 지정·ScriptVerifier용으로만 유지 가능.  
  - Node 유틸 3개는 테스트/배포용이므로 “미사용” 제거보다는 “테스트/배포 전용”으로 분류 유지.
- **중복**: youtube_watch.js와 youtube_commander.js는 “시청” 기능만 겹침. 역할을 “단순 시청 vs 풀 커맨더”로 문서화해 두고, 필요 시 하나로 통합하거나 경로별로 명확히 나누면 됨.

이 문서는 코드 분석 시점(2026-03-01) 기준이며, 워크플로우 러너가 추가되면 DB steps와 scripts/ 파일 매핑을 이 문서에 반영하는 것이 좋습니다.
