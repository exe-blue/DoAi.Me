# 에이전트 워크플로우 정의 (Agent Workflows)

워크플로우는 **모듈**들이 선행조건에 따라 조합된 실행 순서이다.  
**모듈**: 하나의 JS 호출 또는 ADB( Xiaowei 경유 ) 명령 단위.

---

## 선행조건 유형 (Precondition Handling)

| 유형 | 설명 | 동작 |
|------|------|------|
| **스킵 (SKIP)** | 조건이 없으면 해당 단계를 건너뜀. | 할 일이 없거나 에러가 나도 다음으로 진행 가능. |
| **에러 (ERROR)** | 실패 시 에러 처리. | (문서상 구분용; 현재 플로우는 대기/스킵 위주) |
| **대기 (WAIT)** | 완료될 때까지 다음 단계로 넘어가지 않음. | 반드시 완료 후 진행. |
| **병렬 (PARALLEL)** | 여러 모듈을 동시에 실행 가능. | 순서 의존 없이 동시 수행. |

- **스킵**: 조건 없음 → 넘어감. 에러/할일 없음 → 스킵 단계는 넘어가도 됨.
- **대기**: 에러가 나도 대기 단계는 기다려야 함.
- **병렬**: 서로 의존하지 않는 단계는 동시 실행.

---

## 워크플로우 1: 최초 실행 (Initial Bootstrap)

에이전트 프로세스 기동 시 한 번 수행되는 흐름.  
구현: `agent/agent.js` `main()`.

| 순서 | 선행조건 | 모듈(또는 단계) | 코드 위치 |
|------|----------|-----------------|-----------|
| 1 | **병렬** | Supabase 연결 | `SupabaseSync` 생성 → `verifyConnection()` |
| 2 | **병렬** | WebSocket(Xiaowei) 연결 | `XiaoweiClient` 생성 → `waitForXiaowei()` (내부에서 `connect()`) |
| 3 | **대기** | 디바이스 시리얼/IP 확인 | `xiaowei.list()` (PRE_CHECK Stage B), Heartbeat 첫 beat에서 `parseDeviceList` + `resolveHardwareSerialsForList` |
| 4 | **대기** | 디바이스 기존기록 대비 차이 업데이트 | Heartbeat → `supabaseSync.batchUpsertDevices(devices, pcId)` |
| 5 | **병렬** | 디바이스 최적화 | `presets.optimize(xiaowei, serial)` (연결 직후 1회, `runOptimizeOnConnect`) |
| 6 | **대기** | 에이전트 실행 | Heartbeat 시작 → `startHeartbeat()` 후 DeviceOrchestrator/QueueDispatcher/ScheduleEvaluator 시작 |

**구현 참고:** 현재는 Supabase(Phase 1) 완료 후 WebSocket(Phase 2) 순차 실행. 디바이스 확인·차이 업데이트는 Heartbeat 첫 beat에서 수행되며, 그 후 최적화·에이전트 실행(오케스트레이터 등)이 이어짐.

---

## 워크플로우 2: 각 디바이스별 체크 (Per-Device Setup & Assignment)

디바이스 단위로 프록시/계정을 확인·배정하는 흐름.  
구현: `agent/agent.js` Phase 2 후반, 및 `onXiaoweiConnected` 재연결 시.

| 순서 | 선행조건 | 모듈(또는 단계) | 코드 위치 |
|------|----------|-----------------|-----------|
| 1 | **스킵** | 프록시 주소 없는 디바이스 체크 | `proxyManager.loadAssignments(pcUuid)` → count 0이면 스킵 |
| 2 | **대기** | 프록시풀 확인 | `loadAssignments()` 완료 (Supabase `proxies` 등 조회) |
| 3 | **스킵** | 여유분만큼 선행선출(FIFO)으로 프록시 하나씩 배정 | `proxyManager.applyAll()` (배정된 것만 적용; 여유분 배정 정책은 DB/풀 로직) |
| 4 | **병렬** | 아이디(계정) 없는 디바이스 체크 | `accountManager.loadAssignments(pcUuid)` 후 `verifyAll()` (디바이스별 YouTube 로그인 확인) |
| 5 | **대기** | 아이디풀 확인 | `accountManager.loadAssignments()` 완료 |
| 6 | **스킵** | 여유분만큼 선행선출로 계정 하나씩 배정 | (현재 구현: `accounts` 테이블 기반 device–account 배정; 여유분 선행선출은 대시/수동 또는 별도 정책) |

**참고:**  
- 프록시: `setup/proxy-manager.js` — `loadAssignments` → `applyAll` (스킵: 할당 0개면 "no assignments (skipped)").  
- 계정: `setup/account-manager.js` — `loadAssignments` → `verifyAll` (스킵: 할당 0개면 "no assignments (skipped)").

---

## 워크플로우 3: 워밍업 (Warmup)

키워드·페르소나 기반으로 **w.task** 및 **w.task_device**를 생성한 뒤, 디바이스별 라운드로빈으로 검색 → 영상 선택 → 시청 → 액션(댓글/좋아요/담기)을 수행하는 흐름.  
동시 시청은 최대 20대까지, 이후 다음 기기로 진행.

| 순서 | 선행조건 | 모듈(또는 단계) | 데이터/비고 |
|------|----------|-----------------|-------------|
| 1 | **대기** | 인공지능에 의한 키워드 생성 | (외부/대시 또는 API에서 키워드·페르소나 수집) |
| 2 | **대기** | w.task 생성 | 키워드, 페르소나 수집. **확률로 결정**: 시청시간(초), 댓글 여부, 담기 여부, 좋아요 여부, 댓글일 시 댓글 텍스트. **task_devices**도 Supabase에서 동일 확률로 변수 없이 생성 후 전달. |
| 3 | **병렬** | 각 PC의 디바이스별 라운드로빈 배정 | `claim_task_devices_for_pc` / `claim_next_task_device`로 디바이스당 1건씩 claim → 실행. |
| 4 | **대기** | w.task_device의 키워드로 영상 검색 | `task-executor._buildSearchQuery(keyword)` → `_searchAndSelectVideo(serial, query)` |
| 5 | **대기** | 랜덤 숫자에 의해 영상 선택 | 검색 결과 중 선택 (현재 구현: `task-executor` 내 검색·선택 로직) |
| 6 | **대기** | 영상 시청 | `_watchVideoOnDevice` — durationSec, watch_min_pct~watch_max_pct |
| 7 | **병렬** | 영상 액션(댓글, 좋아요, 담기) | 시청 중/후 `_doLike`, `_doComment`, 담기(playlist) — `task-executor.js` engagement |

**구현 참고:**  
- task/task_devices 생성: 웹 대시·API 또는 `task_queue` → `queue-dispatcher`에서 tasks + task_devices 생성. config에 keyword, duration_sec, prob_like, prob_comment, comment_content 등 스냅샷으로 저장.  
- 실행: `device/device-orchestrator.js` claim → `task/task-executor.js` `runTaskDevice` → `_watchVideoOnDevice` (검색·시청·액션). 동시 실행 수 `maxConcurrentTasks`(기본 20).

---

## 워크플로우 4: 작업시청 (Task Watch)

Cron으로 새 영상 수집 후, **접속 중인 온라인 디바이스 수**만큼 task·task_device를 생성하고, 제목(키워드)으로 검색 → 진입·재생 → 광고 스킵 → 시간대별 액션 실행.

| 순서 | 선행조건 | 모듈(또는 단계) | 데이터/비고 |
|------|----------|-----------------|-------------|
| 1 | **대기** | Cron으로 새로운 영상 수집 | `schedule-evaluator` 또는 외부 Cron → 새 영상 메타 수집 |
| 2 | **대기** | task, task_device 생성 | 접속 중 온라인 디바이스 수만큼 생성. **변수 전부 설정**: 시청시간, 댓글 여부, 댓글(있을 시) 텍스트, 좋아요 여부, 좋아요 시간, 담기 시간, 댓글 시간, 담기 여부, 제목, 주소, 키워드(일단 제목으로 지정). |
| 3 | **병렬** | 라운드로빈으로 배분 | 디바이스별 claim → 1 task_device씩. 담기/댓글/좋아요 **시간**은 시청시간 구간 내 랜덤; **두 액션 간격이 30초 미만이면** 뒤 액션을 뒤로 미룸. |
| 4 | **대기** | 영상 제목으로 검색 | `_buildSearchQuery(title)` → 키워드=제목 |
| 5 | **대기** | 해당 영상 진입 후 재생 | `_searchAndSelectVideo` 또는 URL 직접 진입 |
| 6 | **대기** | 6초 뒤 광고 스킵 | 재생 시작 후 6초 시점에 스킵 처리 (구현 위치: task-executor 또는 youtube 플로우) |
| 7 | **병렬** | 시간대별 적합한 시점에 액션 실행 | likeAtSec, commentAtSec, playlistAtSec 등 config/랜덤에 따라 시청 중 `_doLike`, `_doComment`, 담기 실행 |

**구현 참고:**  
- Cron/수집: `scheduling/schedule-evaluator.js`(task_schedules), 또는 `task_queue` + `scheduling/queue-dispatcher.js`에서 task/task_devices 생성.  
- 액션 시간: `task-executor._watchVideoOnDevice` 내에서 `likeAtSec`, `commentAtSec`, `playlistAtSec` 등 시청 구간 내 랜덤; 30초 미만 간격 시 뒤로 미루는 로직은 필요 시 추가.  
- 광고 스킵 6초: 현재 `task-executor`/유튜브 플로우에 있으면 해당 단계, 없으면 별도 모듈로 추가.

---

## 워크플로우 7: 로깅 및 기록관리 (Logging & Record Management)

영상 시청 이벤트 수집 → 완료 판정(정상/일부오류/실패) → 완료 시 이벤트·스크린샷 PC 전송. **API로 연결된 웹 대시보드에서 구현.**

| 순서 | 선행조건 | 모듈(또는 단계) | 데이터/비고 |
|------|----------|-----------------|-------------|
| 1 | **대기** | 영상 시청 이벤트 수집 | 디바이스 시청·액션 이벤트 수집 |
| 2 | **병렬** | 웹소켓 또는 웹훅으로 실시간 수집 | 실시간 스트림 수집 |
| 3 | **(최종 판정)** | 완료/일부오류/실패 구분 | **1. 정상**: 정의된 시간만큼 시청 + 액션 진행 → 작업완료. **2. 일부오류**: 시간 또는 액션 중 일부 미달. **3. 실패**: 아무것도 안 했거나 다른 영상 진입. |
| 4 | **대기** | 완료 시 이벤트 수집 + 스크린샷 촬영 → PC 전송 | 해당 이벤트 수집 및 스크린샷을 PC로 전송 |

**구현 참고:** 웹 대시보드(API 연동)에서 이벤트 수집·판정·스크린샷 요청/수신 구현. 에이전트는 `task_executor` 완료 시 로그/결과 전송, 스크린샷은 device-presets·flows 등에서 저장 후 API 업로드 가능.

---

## 워크플로우 8: 컨텐츠 및 채널 관리 (Content & Channel Management)

컨텐츠 수동 등록 → 채널 신규 영상 주기 체크 → 영상 수집·정리 → task_device 확률 기반 생성 → 댓글 AI 생성 → 완료분 수신·저장 → 순차/랜덤 전달(최대 20대 유지, 18대 시 다음 작업 요청).

| 순서 | 선행조건 | 모듈(또는 단계) | 데이터/비고 |
|------|----------|-----------------|-------------|
| 1 | **대기** | 컨텐츠 수동 등록 | 채널·컨텐츠 등록 (대시/API) |
| 2 | **병렬** | 등록된 채널에 신규 영상 올라오는지 1분마다 체크 | 주기 폴링 또는 웹훅 |
| 3 | **대기** | 영상 수집 — 제목, 본문, 길이, 키워드 정리 | 수집 파이프라인 |
| 4 | **병렬** | 온라인 디바이스 수만큼 확률 기반 **task_device** 명령 생성 | 시청시간, 댓글 여부·댓글·댓글시간, 좋아요 여부·좋아요시간, 담기 여부·담기시간, **작업순서**: 먼저 생성한 것부터. 작업 ID 예: `260303_2_34_안녕하세요` (26년 3월 3일, 2번째 영상, 34번째 기기, 제목 "안녕하세요" — 당일 총 영상 번호 + 생산 번호 + 날짜 + 제목) |
| 5 | **병렬** | 댓글 개수만큼 인공지능이 댓글 생성 → 테이블 채움 | `comment-generator` 또는 대시/API 배치 |
| 6 | **대기** | 완료되는 만큼 영상 제공받아 저장 | 완료 이벤트 → 영상 메타/결과 저장 |
| 7 | **대기** | 영상을 순차/랜덤 전달(선택 가능), 최대 20대 유지, 로그 보고. **18대가 되면** 서버에 다음 작업 영상 요청 | 에이전트가 claim으로 task_device 소비 → 여유 생기면(예: 18대) 서버에 다음 작업 요청하여 20대 유지 |

**구현 참고:** 채널 체크·영상 수집·task 생성은 웹/API·Cron; 작업 ID 형식(`260303_2_34_제목`)은 발행 시 적용. 에이전트는 `claim_task_devices_for_pc`로 가져와 실행하며, 대시에서 “다음 작업 요청” 시 새 task/task_devices를 넣어 주면 20대 유지.

---

## 모듈 ↔ 코드 매핑 요약

| 워크플로우 | 단계 | 모듈/역할 | 파일 |
|------------|------|-----------|------|
| 1 | Supabase 연결 | `verifyConnection()` | `core/supabase-sync.js` |
| 1 | WebSocket 연결 | `XiaoweiClient` + `waitForXiaowei` | `core/xiaowei-client.js`, `agent.js` |
| 1 | 디바이스 시리얼/IP | `xiaowei.list()` + `resolveHardwareSerialsForList` | `device/heartbeat.js`, `device/device-serial-resolver.js` |
| 1 | 디바이스 차이 업데이트 | `batchUpsertDevices` | `core/supabase-sync.js`, `device/heartbeat.js` |
| 1 | 디바이스 최적화 | `presets.optimize` | `device/device-presets.js` |
| 1 | 에이전트 실행 | `startHeartbeat`, `deviceOrchestrator.start` 등 | `agent.js`, `device/heartbeat.js`, `device/device-orchestrator.js` |
| 2 | 프록시 풀/배정 | `loadAssignments`, `applyAll` | `setup/proxy-manager.js` |
| 2 | 계정 풀/검증 | `loadAssignments`, `verifyAll` | `setup/account-manager.js` |
| 3 | 키워드 생성 | (AI/대시·API) | 외부 또는 comment-generator 유사 |
| 3 | w.task / task_devices 생성 | task_queue → tasks + task_devices, config 스냅샷 | 웹 API, `scheduling/queue-dispatcher.js` |
| 3 | 라운드로빈 배정 | `claim_task_devices_for_pc`, `claim_next_task_device` | `device/device-orchestrator.js` |
| 3 | 키워드 검색·영상 선택·시청·액션 | `_buildSearchQuery`, `_searchAndSelectVideo`, `_watchVideoOnDevice`, `_doLike`/`_doComment`/담기 | `task/task-executor.js` |
| 4 | Cron 영상 수집 | task_schedules 또는 task_queue | `scheduling/schedule-evaluator.js`, `scheduling/queue-dispatcher.js` |
| 4 | task/task_device 생성(온라인 수만큼) | 변수 전부 설정 후 insert | queue-dispatcher 또는 API |
| 4 | 제목 검색·진입·재생·6초 광고스킵·시간대별 액션 | 동일 + 광고 스킵 | `task/task-executor.js` |
| 7 | 시청 이벤트 수집 | 웹소켓/웹훅 실시간 | 웹 대시보드(API) |
| 7 | 완료 판정·스크린샷 전송 | 정상/일부오류/실패, 완료 시 스크린샷 | 웹 대시보드, 에이전트 로그/스크린샷 |
| 8 | 컨텐츠 수동 등록·채널 1분 체크·영상 수집 | 제목/본문/길이/키워드 정리 | 웹/API, 수집 파이프라인 |
| 8 | task_device 확률 생성·작업 ID(260303_2_34_제목)·AI 댓글 | 온라인 수만큼, 순서·댓글 테이블 | queue-dispatcher/API, `setup/comment-generator.js` |
| 8 | 완료분 저장·순차/랜덤 전달·18대 시 다음 요청 | 최대 20대 유지, 로그 | 웹 대시보드, claim 기반 |

---

## 모듈 휴식 (Module delay)

각 모듈 실행 전 랜덤 휴식(ms). **최소 딜레이(ms)**·**최대 딜레이(ms)** 로 설정하며, 클라이언트(웹 대시보드)에서 다른 전역 설정과 동일하게 설정 가능. 기본값: 1500 ~ 4000 ms. 설정 키: `module_min_delay_ms`, `module_max_delay_ms`. 자세한 내용: [WORKFLOW_MODULES.md](WORKFLOW_MODULES.md) §6.

---

## 관련 문서

- **모듈 매핑·실행 모델·구현 현황**: `agent/docs/WORKFLOW_MODULES.md`
- **모듈 계층**: `agent/MODULES.md`
- **부트스트랩 순서**: `agent/agent.js` `main()` 주석 및 Phase 1/2/3 구간
- **운영 규칙**: `agent/docs/OPERATION_RULES_ENFORCEMENT.md`
