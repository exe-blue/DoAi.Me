# Agent 레거시/아카이브 파일 설명

`_archive/agent-legacy/`에 있는 파일들 중 요청된 항목만 간단히 설명합니다.

---

## 스크립트·패치류

### task-executor_run.js
**역할:** task-executor를 **단독 실행**하는 스크립트.  
Agent 전체(agent.js)를 띄우지 않고, Xiaowei + Supabase만 붙여서 `TaskExecutor`만 돌릴 때 사용.  
현재 프로세스에서는 `agent.js`가 TaskExecutor를 부트하므로 **미사용**.

### youtube-runner-adapter.js
**역할:** **task-devices / 워크플로 러너 ↔ agent/youtube 모듈** 어댑터.  
Xiaowei + deviceTarget(connection_id 또는 serial)으로 `ADBDevice`를 만들고, `youtube/preflight`, `youtube/search`, `youtube/watch`, `youtube/action`(좋아요·댓글·재생목록)을 단계별로 실행.  
현재 프로세스에서는 `task-executor.js`가 **인라인 YouTube 플로우 + device-presets**만 쓰고 `youtube/` 모듈을 require 하지 않으므로 **미사용**.

### task_executor_autojs_patch.js
**역할:** task-executor에 **AutoJS 연동**을 넣기 위한 **패치 문서/코드 조각**.  
`run_script` 타입 task에서 `cmd.json` 업로드 → `xiaowei.autojsCreate()` 호출 → `result.json` 폴링까지 하는 코드를 **기존 switch 안에 추가하라**는 식의 가이드.  
실제 task-executor에는 이 패치가 적용되어 있지 않고, 현재는 `youtube` 타입이 인라인 + `youtube_watch.js` 스크립트 방식으로 동작하므로 **참고용 패치**.

### task_executor_patch.js
**역할:** task-executor에 **upload_file** 타입**과** XiaoweiClient에 **upload_file / deploy** 관련 메서드**를 추가하라는 패치 문서.  
`upload_file` 케이스 예시, `POST /api/youtube/deploy` 사용 예가 적혀 있음.  
현재 task-executor/웹 API에 해당 타입이 없으면 **미적용 패치**.

### supervisor.js
**역할:** **Agent 프로세스 감시(슈퍼바이저)**.  
`node supervisor.js`로 실행하면 내부에서 `agent.js`를 **자식 프로세스**로 띄우고, 크래시 시 일정 시간 후 재시작. 5분 안에 재시작 10회 초과 시 크래시 루프로 간주해 재시작 중단, Supabase Realtime `room:system`으로 이벤트 발행.  
현재는 `agent.js`를 직접 실행하거나 PM2 등으로 돌리는 경우가 많아 **선택 사용**.

### xiaowei-client-patch.js
**역할:** `core/xiaowei-client.js`에 **autojsCreate, autojsRemove, autojsTasks, pullFile** 메서드를 추가하라는 **패치 문서/코드 조각**.  
Xiaowei WebSocket 프로토콜에 맞춰 `send({ action: 'autojsCreate', ... })` 형태로 보내는 예시가 있음.  
현재 xiaowei-client에 해당 메서드가 이미 있으면 **참고용**, 없으면 적용 시 이 패치를 참고.

---

## task/ 레이어 (barrel·미사용 모듈)

### task/index.js
**역할:** task 레이어 **barrel export**.  
`TaskExecutor`, `TaskStateMachine`, `CommandExecutor`, `CommandPoller`, `StaleTaskCleaner`를 한꺼번에 re-export.  
현재 `agent.js`는 `task/task-executor.js`, `task/stale-task-cleaner.js`만 직접 require 하므로 **미사용**.

### command-executor.js
**역할:** **command_logs** 테이블 Realtime 구독 → `pending` INSERT 시 해당 명령을 Xiaowei로 디바이스에 실행.  
단일/그룹/전체 디바이스 타겟, 위험 명령 패턴 차단(rm -rf, format, factory reset 등).  
현재 프로세스에서는 agent.js가 CommandExecutor를 부트하지 않아 **미사용**.

### command-poller.js
**역할:** **preset_commands** 테이블을 **폴링**해서 `pending` 건을 가져와 `device-presets`(scan, optimize 등) 실행 후 상태를 completed/failed로 업데이트.  
웹 대시보드에서 “프리셋 실행” 요청 시 DB에 INSERT → 폴러가 감지해 실행하는 흐름.  
현재 agent.js가 CommandPoller를 시작하지 않아 **미사용**.

### task-state-machine.js
**역할:** 태스크 **상태 머신** 헬퍼.  
IDLE → QUEUED → RUNNING → COMPLETED/FAILED → RETRY_PENDING → DEAD_LETTER 전이를 정의하고, 잘못된 전이 시 throw.  
현재 task-executor는 이 모듈을 사용하지 않고 자체적으로 상태를 관리해 **미사용**.

---

## device-serial-resolver.js

**역할:** **IP:PORT(연결 ID) → 실제 기기 시리얼** 추출.  
`adb connect 192.168.1.100:5555`처럼 연결하면 `adb devices`에는 `192.168.1.100:5555`가 뜨는데, DB나 내부적으로는 기기 고유 **하드웨어 시리얼**이 필요할 수 있음.  
이 모듈은 `getprop ro.serialno`(및 fallback으로 `ril.serialnumber`)를 Xiaowei `adbShell`로 호출해 **IP:5555 → 실제 시리얼**을 반환.  
`isIpPortIdentifier(deviceId)`, `resolveHardwareSerial(xiaowei, deviceId)`, `resolveHardwareSerialsForList(...)` 등 제공.  
현재 프로세스에서는 사용하지 않지만, 디바이스 목록이 IP:PORT만 있을 때 시리얼로 매핑해야 할 경우 **복원 후 사용** 가능.
