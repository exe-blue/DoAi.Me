# agent/ · scripts/ JS 파일 코드 리뷰 — 기능 정리

각 .js 파일을 코드 기준으로 리뷰해 **주요 기능**을 정리한 문서.

---

## 1. agent/ — 에이전트 런타임 (Node.js, Windows PC)

### agent/agent.js
- **역할**: 에이전트 진입점. Supabase ↔ Xiaowei 브릿지로 24/7 구동.
- **기능**: (1) 설정 검증(SUPABASE_URL, ANON_KEY) (2) Supabase 연결 검증 (3) settings 테이블에서 동적 설정 로드·Realtime 구독 (4) PC 등록(getPcId) (5) Xiaowei WebSocket 연결 대기 (6) 연결 직후 선택 시 모든 디바이스에 presets.optimize 1회 (7) 하트비트·ADB 재연결·디바이스 워치독·프록시·계정·스크립트 검증·스테일 태스크 복구·큐 디스패처·스케줄 평가·디바이스 오케스트레이터 순서로 기동 (8) Graceful shutdown 시 채널 해제·타이머 정리.

### agent/config.js
- **역할**: 정적 env + DB 동적 설정 관리.
- **기능**: (1) env에서 PC_NUMBER, SUPABASE_*, XIAOWEI_WS_URL, SCRIPTS_DIR, LOGGING_DIR, RUN_OPTIMIZE_ON_CONNECT 등 읽기 (2) settings 테이블에서 heartbeat_interval, max_concurrent_tasks 등 로드 (3) settings 테이블 Realtime UPDATE 구독 → 변경 시 _applySettingFromDB로 config 반영 후 'config-updated' 이벤트 (4) get(key)로 raw 설정 조회, unsubscribe()로 채널 해제.

### agent/core/xiaowei-client.js
- **역할**: Xiaowei WebSocket 클라이언트. 디바이스 제어·자동화 명령 전송.
- **기능**: (1) WebSocket 연결·자동 재연결(지수 백오프)·연결 끊김 시간 추적(extended-disconnect 이벤트) (2) send()로 요청 전송, 응답 시 pending 요청 resolve(FIFO) (3) list() 디바이스 목록, parseDeviceList로 정규화 (4) adbShell(devices, command), adb(), autojsCreate(devices, scriptPath, options), actionCreate(devices, actionName, options) (5) pointerEvent, inputText, startApk, stopApk, installApk, uninstallApk, screen(스크린샷), uploadFile, pushEvent, goHome (6) 연결 끊김 시 명령 큐잉, 재연결 후 _flushQueue.

### agent/core/supabase-sync.js
- **역할**: Supabase 연동 — PC/디바이스/태스크/태스크디바이스/실행 로그.
- **기능**: (1) verifyConnection (2) getPcId(pcNumber): pcs 조회 또는 생성, pcId/pcUuid 저장 (3) updatePcStatus, upsertDevice, batchUpsertDevices (4) markOfflineDevices: last_heartbeat 오래된 devices를 offline으로 (5) claim_task_devices_for_pc RPC 호출, complete_task_device, fail_or_retry_task_device (6) insertExecutionLog: 실행 로그 삽입(버퍼 배치·주기 flush) (7) updateTaskStatus, incrementRetryCount (8) task_devices Realtime 구독·Broadcast 구독, 로그 채널 구독 (9) getTaskByVideoId 등 DB 조회 헬퍼.

### agent/core/dashboard-broadcaster.js
- **역할**: 대시보드 실시간 이벤트 푸시.
- **기능**: (1) room:dashboard, room:system, room:devices 채널 구독 (2) publishDashboardSnapshot(snapshot): 대시보드 스냅샷 broadcast (3) publishSystemEvent(eventType, message, details): 시스템 이벤트 broadcast (4) broadcastWorkerDevices(workerId, devices): 디바이스 목록 broadcast (5) detectAndPublishChanges(currentDevices): 이전 상태와 비교해 offline/recovered 감지 후 이벤트 1회씩 발행 (6) cleanup() 채널 해제.

### agent/device/heartbeat.js
- **역할**: 주기 하트비트 — 디바이스·PC 상태 동기화.
- **기능**: (1) startHeartbeat(): config.heartbeatInterval마다 beat() 실행 (2) beat(): xiaowei.list()로 디바이스 목록 조회 → resolveHardwareSerialsForList로 IP:PORT를 하드웨어 serial로 변환 (3) batchUpsertDevices, updatePcStatus(online) (4) 이전에 있던 디바이스가 없어지면 error 카운트, ERROR_THRESHOLD 초과 시 markOfflineDevices (5) reconnectManager.updateRegisteredDevices, getDeviceOrchestrator로 task_status 동기화(syncDeviceTaskStates) (6) broadcaster로 디바이스 목록·변경 이벤트 발행.

### agent/device/device-serial-resolver.js
- **역할**: TCP(IP:PORT) 연결 디바이스의 하드웨어 시리얼 해석.
- **기능**: (1) isIpPortIdentifier(id): "IP:PORT" 형식 여부 (2) resolveHardwareSerial(xiaowei, deviceId): adb shell getprop ro.serialno 또는 ril.serialnumber로 실제 시리얼 조회 (3) resolveHardwareSerialsForList(xiaowei, deviceList): 목록 중 IP:PORT인 항목만 변환, 반환 시 .serial=하드웨어시리얼, .connectionId=원래 id 유지.

### agent/device/device-orchestrator.js
- **역할**: 디바이스별 작업 배정·실행 오케스트레이션.
- **기능**: (1) 3초마다 _orchestrate(): xiaowei.list()로 디바이스 목록 갱신 (2) 상태(idle, free_watch, searching, watching, completing, error, quarantined)별 처리: idle → _assignWork (3) _assignWork: claim_task_devices_for_pc RPC로 task_devices 선점 → runTaskDevice 호출 (4) watching 타임아웃(30분) 시 error 전이 (5) error 시 _tryRecoverError (6) 완료 시 takeScreenshotOnComplete(로깅 디렉터리), complete_task_device RPC (7) 실패 시 fail_or_retry_task_device.

### agent/device/device-presets.js
- **역할**: Xiaowei로 실행하는 프리셋 명령 세트.
- **기능**: (1) scan(xiaowei, serial): getprop, wm size, settings 등으로 모델·해상도·회전·밝기·배터리·YouTube 버전 등 스캔 (2) optimize(xiaowei, serial): 효과 최소화·해상도 1080x1920·세로 고정·stay_on 등 (3) 기타 프리셋(adb/UI 제어) — presets 목록 반환. Xiaowei 응답에서 data[serial] 추출 헬퍼(extractValue).

### agent/device/device-watchdog.js
- **역할**: 디바이스 이상 감지·복구·대량 이탈 시 디스패치 일시 정지.
- **기능**: (1) 60초마다 _check(): DB에서 해당 PC의 devices 조회 (2) last_heartbeat가 5분 이상 오래된 디바이스 → 오프라인 처리·broadcaster 이벤트 (3) 연속 에러 N회 이상 디바이스에 대해 복구 시도(adb reconnect 등), RECOVERY_MAX_ATTEMPTS (4) 일정 비율 이상 디바이스 이탈 시 _dispatchPaused=true, 2분 후 해제 (5) 배치 단위 복구(BATCH_SIZE, BATCH_DELAY_MS).

### agent/device/adb-reconnect.js
- **역할**: ADB TCP 끊어진 디바이스 자동 재연결.
- **기능**: (1) 60초마다 reconnectCycle(): heartbeat에서 알려준 registeredDevices와 xiaowei.list() 비교 (2) 목록에 없으면 adb reconnect IP:5555 시도, maxRetries·reconnectTimeout (3) deadThreshold 연속 실패 시 dead 플래그 (4) updateRegisteredDevices(devices)로 heartbeat와 연동 (5) broadcaster로 재연결 이벤트.

### agent/device/screenshot-on-complete.js
- **역할**: 시청(작업) 완료 시 디바이스 스크린샷 저장.
- **기능**: (1) takeScreenshotOnComplete(xiaowei, connectionTarget, dailyCumulativeCount, loggingDir): xiaowei.screen() 호출 (2) 파일명 `YYYY-MM-DDTHH-mm-ss-NNN.png` (NNN=당일 누적 작업 수) (3) ensureDir(loggingDir)로 디렉터리 생성.

### agent/task/task-executor.js
- **역할**: Supabase task → Xiaowei 명령 매핑·실행.
- **기능**: (1) execute(task): 동시 실행 수 제한, task_devices config 조회, _dispatch(taskType, …) 호출 후 상태·실행 로그·재시도 카운트 갱신 (2) **task_devices 기반 실행**: runTaskDevice(taskDevice) — config에서 video_url, 시청 비율, engagement(좋아요/댓글/구독/담기) 읽어 _watchVideoOnDevice 호출 (3) _watchVideoOnDevice: 세로 고정·YouTube 기동 → 검색 또는 URL로 영상 진입 → 광고 스킵·재생 → 시청 시간 동안 확률로 좋아요/구독/댓글(CommentGenerator)/담기 → complete_task_device (4) **task_type 분기**: view_farm/watch_video → _executeWatchVideo(기본 scriptPath youtube_watch.js이지만 현재 경로는 _watchVideoOnDevice만 사용), run_script/script → autojsCreate(scriptPath), adb/adb_shell, actionCreate, start_app/stop_app, install_apk, screenshot, push_event 등 (5) _resolveScriptPath: SCRIPTS_DIR + 상대 경로 또는 절대 경로 그대로 (6) YT UI 셀렉터·PERSONALITY_TYPES·재시도·adbShell 추출 헬퍼.

### agent/task/stale-task-cleaner.js
- **역할**: 크래시/재시작 후 멈춰 있는 running 태스크 복구.
- **기능**: (1) recoverStaleTasks(): 기동 시 1회 — 해당 PC의 status=running인 tasks 중 started_at이 30분 초과 또는 없으면 failed로 변경, 관련 task_devices도 failed (2) 주기(5분) _tick: 동일 기준으로 stale 검사 후 실패 처리.

### agent/scheduling/queue-dispatcher.js
- **역할**: task_queue → tasks 디스패치(푸시).
- **기능**: (1) 30초 폴링 + task_queue INSERT(queued) Realtime으로 _tick 트리거 (2) _tick: running tasks 수 확인, maxConcurrentTasks 초과 시 스킵 (3) task_queue에서 status=queued, target_worker null인 항목 priority DESC, created_at ASC로 조회 (4) _dispatchItem(item): task_config로 tasks 1건 INSERT(트리거가 task_devices 생성), task_queue 행을 dispatched로 갱신 (5) broadcaster로 task_dispatched 이벤트.

### agent/scheduling/schedule-evaluator.js
- **역할**: cron 스케줄 평가 → task_queue 삽입.
- **기능**: (1) 30초마다 _tick: task_schedules에서 is_active=true, next_run_at <= now() 조회 (2) _processSchedule: 동일 스케줄의 이전 task가 아직 queued/running이면 스킵(중복 방지) (3) 스케줄 설정(cron 등)으로 task_queue에 INSERT (4) last_run_at, next_run_at, run_count 갱신 (5) cron-parser 사용.

### agent/setup/script-verifier.js
- **역할**: AutoJS 스크립트 배포·실행 가능 여부 검증.
- **기능**: (1) checkScriptsDir(): SCRIPTS_DIR 존재·읽기, .js 목록 수집 (2) checkRequired(): REQUIRED_SCRIPTS(youtube_watch.js) 존재 여부 (3) ensureTestScript(): test_ping.js 없으면 로그만 찍고 exit하는 최소 스크립트 생성 (4) runTestScript(serial): autojsCreate로 test_ping.js 실행 (5) verifyAll(testSerial): dir + required + test 한 번에 실행.

### agent/setup/comment-generator.js
- **역할**: OpenAI로 YouTube 댓글 문구 생성.
- **기능**: (1) generate(videoTitle, channelName, videoId): 최대 3회 시도 (2) _callAPI: ChatGPT API(system 프롬프트: 한국어 짧은 댓글·이모지·스팸/AI 투 금지) (3) _isValid: 스팸/AI 키워드 필터, 길이 제한 (4) 최근 100개 댓글 중복 방지.

### agent/setup/proxy-manager.js
- **역할**: 프록시 할당·디바이스 적용·실패 감지·로테이션.
- **기능**: (1) loadAssignments(workerId): proxies 테이블에서 pc_id 일치·device_id 있는 행 조회, devices와 조인해 serial별 할당 (2) applyAll(): 각 디바이스에 adb shell로 프록시 설정 적용 (3) verifyAll(): 외부 IP 확인으로 프록시 동작 검증 (4) startCheckLoop(): 주기 검증, fail_count 증가·임계치 시 rotate_on_failure 로테이션 (5) 정책: sticky, rotate_on_failure, rotate_daily.

### agent/setup/account-manager.js
- **역할**: 계정–디바이스 할당·YouTube 로그인 상태 검증.
- **기능**: (1) loadAssignments(workerId): accounts 테이블에서 pc_id·device_id 조회, serial별 할당 (2) verifyAll(): 각 디바이스에서 YouTube/Google 로그인 여부 adb 등으로 확인 (3) updateLoginStatus(): 검증 결과를 DB에 반영.

---

## 2. scripts/ — 디바이스 스크립트(AutoJS) + Node 유틸

### scripts/youtube_watch.js
- **역할**: Xiaowei AutoJS 단순 시청 스크립트(디바이스에서 실행).
- **기능**: (1) engines.myEngine().execArgv에서 videoUrl, watchDuration(ms, 기본 30000) 읽기 (2) videoUrl 있으면 `am start -a android.intent.action.VIEW -d '...'` 로 YouTube 앱에서 해당 영상 열기 (3) watchDuration만큼 sleep 후 종료. 광고 스킵·좋아요·댓글 없음.

### scripts/youtube_commander.js
- **역할**: YouTube UI 오브젝트 기반 통합 명령 스크립트(AutoX/AutoJS, 디바이스).
- **기능**: (1) SELECTORS: YouTube 앱 resource-id/desc/class 기반 셀렉터 레지스트리(검색·플레이어·광고·좋아요·댓글·담기·구독 등) (2) ActionHandlers: launch, get_state, search_by_title, watch, like, comment, save_playlist, subscribe, skip_ad, closeAllWindows 등 (3) execute(cmd): cmd.action + params로 단일 액션 실행 (4) pipeline(commands, stepDelay): 명령 배열 순차 실행 (5) 진입점: cmd.json 존재 시 읽어서 실행 후 result.json 저장·cmd.json 삭제; 없으면 execArgv.command/commands 또는 get_state (6) v2.0: SelectorEngine 스핀 방지, launch(fromScratch), ScreenContext 검증, requireWatchPage 가드.

### scripts/youtube_commander_run.js
- **역할**: YouTube Commander 진입 스크립트(디바이스).
- **기능**: (1) engines.myEngine().execArgv에서 command 또는 commands 읽기 (2) require('./youtube_commander.js') 후 pipeline(commands) 또는 execute(command) 호출 (3) 결과 로그·반환. cmd.json 없이 execArgv만으로 호출할 때 사용.

### scripts/youtube-deploy-and-launch.js
- **역할**: Node 스크립트 — 배포 후 명령 실행 연계(수동 테스트).
- **기능**: (1) .env.local에서 API_KEY 등 파싱 (2) POST /api/youtube/deploy (deploy_all, devices, pc_id 등) (3) POST /api/youtube/command (--test면 get_state, 아니면 launch + fromScratch: true) (4) 실패 시 인증/ Supabase 안내 메시지 출력.

### scripts/stress-test.js
- **역할**: Node 스크립트 — Xiaowei 동시성·안정성 스트레스 테스트.
- **기능**: (1) WebSocket으로 Xiaowei 연결 (2) list로 디바이스 목록 조회 (3) ROUNDS 또는 DURATION_MIN 동안 각 디바이스에 testCycle: uiautomator dump → cat ui.xml → input tap → echo ok (4) 성공률·응답 시간·메모리 로깅 (5) 환경변수: XIAOWEI_URL, DURATION_MIN, ROUNDS.

### scripts/smoke-test.js
- **역할**: Node 스크립트 — 에이전트 E2E 스모크.
- **기능**: (1) .env.local/agent/.env에서 SUPABASE_* 로드 (2) tasks에 adb_shell 타입(payload: echo ok) 1건 INSERT (3) 2초마다 해당 task 폴링, status completed면 PASS 종료, failed면 FAIL 종료 (4) 30초 내 완료 안 되면 타임아웃 FAIL.

---

## 3. 요약 표

| 경로 | 한 줄 기능 요약 |
|------|-----------------|
| agent/agent.js | 진입점: 설정·Supabase·Xiaowei·PC등록·하트비트·오케스트레이터·큐디스패처 등 순서 기동 |
| agent/config.js | env + DB settings 로드·Realtime 구독·config-updated 이벤트 |
| agent/core/xiaowei-client.js | Xiaowei WebSocket: list, adbShell, autojsCreate, actionCreate, screen 등 |
| agent/core/supabase-sync.js | getPcId, devices upsert, claim/complete/fail task_devices, execution 로그 |
| agent/core/dashboard-broadcaster.js | room:dashboard/system/devices broadcast, 디바이스 변경 이벤트 |
| agent/device/heartbeat.js | 주기 디바이스 목록·batchUpsert·오프라인 표시·syncDeviceTaskStates |
| agent/device/device-serial-resolver.js | IP:PORT → getprop ro.serialno로 하드웨어 시리얼 해석 |
| agent/device/device-orchestrator.js | 3초마다 claim → runTaskDevice → complete/fail, 스크린샷 |
| agent/device/device-presets.js | scan, optimize 등 Xiaowei 프리셋(adb shell 명령 세트) |
| agent/device/device-watchdog.js | 60초마다 디바이스 건강 검사·복구·대량 이탈 시 디스패치 일시 정지 |
| agent/device/adb-reconnect.js | 60초마다 끊긴 ADB TCP 디바이스 재연결 시도 |
| agent/device/screenshot-on-complete.js | 시청 완료 시 screen()으로 로컬 파일 저장(날짜시간-누적번호.png) |
| agent/task/task-executor.js | task_type별 실행: view_farm(_watchVideoOnDevice), run_script(autojsCreate), adb 등 |
| agent/task/stale-task-cleaner.js | 기동 시·5분마다 running 30분 초과 task/task_devices failed 처리 |
| agent/scheduling/queue-dispatcher.js | 30초+Realtime으로 task_queue → tasks INSERT, queue dispatched 갱신 |
| agent/scheduling/schedule-evaluator.js | 30초마다 task_schedules 만료분 평가 → task_queue INSERT |
| agent/setup/script-verifier.js | SCRIPTS_DIR·youtube_watch.js 존재·test_ping autojsCreate 검증 |
| agent/setup/comment-generator.js | OpenAI로 한국어 댓글 생성·스팸/중복 필터 |
| agent/setup/proxy-manager.js | proxies 할당 로드·디바이스 적용·검증·실패 시 로테이션 |
| agent/setup/account-manager.js | accounts 할당 로드·디바이스별 로그인 상태 검증·DB 갱신 |
| scripts/youtube_watch.js | execArgv로 URL·시청시간 받아 intent 열고 sleep (단순 시청) |
| scripts/youtube_commander.js | cmd.json/execArgv로 검색·시청·좋아요·댓글·담기·구독 등 액션 실행 |
| scripts/youtube_commander_run.js | execArgv command/commands → YouTubeCommander.pipeline/execute |
| scripts/youtube-deploy-and-launch.js | POST deploy + POST command 호출(배포 후 실행 테스트) |
| scripts/stress-test.js | Xiaowei WS로 다수 기기 dump/tap 반복·성공률·메모리 측정 |
| scripts/smoke-test.js | Supabase에 adb task 생성 후 완료까지 폴링(30초 제한) |
