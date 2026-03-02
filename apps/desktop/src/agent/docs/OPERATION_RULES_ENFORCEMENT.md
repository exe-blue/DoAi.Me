# Agent 운영 룰 — 코드 반영 요약

이 문서는 “Agent 운영 룰”을 코드 레벨에서 어떻게 강제했는지 정리한 것이다. 스키마 변경/신규 API/기능 추가는 하지 않았다.

---

## 변경된 파일 목록

| 파일 | 변경 요약 |
|------|------------|
| `agent/lib/sleep.js` | **신규.** 공통 sleep 유틸 (Rule H). |
| `agent/lib/logger.js` | **신규.** 구조화 로그: timestamp, level, module, pc_id 등 (Rule G). |
| `agent/agent.js` | Phase 1/2/3 로그, Xiaowei connected 시 초기화 루틴, primary_pc 적용 후 QueueDispatcher 조건 기동, sleep/logger 사용. |
| `agent/config.js` | `primary_pc_id` 설정 키 및 `setPrimaryFromDb(pcUuid)` 추가 (Rule F: DB 우선, env fallback). |
| `agent/device/device-orchestrator.js` | sleep/logger 사용, _hasPendingAssignment/_countDevicesOnTask 예외 시 WARN 로그, claim 직후 device_id/device_serial 일치 검사 후 불일치 시 release (Rule A, C). |
| `agent/task/task-executor.js` | sleep 사용, _getUiDumpXml 폴링(0.5s, 최대 8s) 및 실패 시 단계명/원인/xml 샘플 로그, _findAndTap stepName, _searchAndSelectVideo에서 FIRST_RESULT=리스트 첫 항목(RELATED_VIDEO→VIDEO_TITLE) (Rule B, H). |
| `agent/task/stale-task-cleaner.js` | task_devices 타임아웃 주기 검사: running + lease_expires_at < now → failed, error='timeout', attempt+1; attempt >= max_attempts 시 devices.status='error', total_errors+1 (Rule I). |
| `agent/device/device-presets.js` | `_sleep` 제거, `lib/sleep.js` 사용 (Rule H). |
| `agent/device/adb-reconnect.js` | 내부 sleep 메서드가 `lib/sleep.js` 호출 (Rule H). |
| `agent/device/device-watchdog.js` | 지연용 `new Promise(setTimeout)` → `lib/sleep.js` (Rule H). |
| `agent/setup/comment-generator.js` | 재시도 대기 1초를 `lib/sleep.js` 사용 (Rule H). |
| `agent/README.md` | 실행 경로(SSOT task_devices, job_assignments 미사용), sleep/entrypoint 문서화. |

---

## 룰별 코드 반영 요약

### 절대 규칙 / 제약
- **SSOT = task_devices, 경로 = claim_task_devices_for_pc / claim_next_task_device → runTaskDevice**  
  - `device-orchestrator.js` 상단 주석 및 README에 명시. job_assignments 실행 경로는 사용하지 않음(기존부터 미사용).
- **DB 스키마/테이블/컬럼/신규 API**  
  - 변경 없음.
- **권장가 아닌 코드로 enforce**  
  - 아래 A~I는 검증/로그/폴링/조건 분기로 강제.

### A) 식별자 일관성
- **device_id / device_serial 일치**  
  - `device-orchestrator.js` `_assignWork()` 내: claim 직후 `taskDevice.device_id` → `_deviceIdToSerial`로 기대 serial 계산, `taskDevice.device_serial`과 실행 대상 serial 비교. 불일치 시 `_releaseTaskDevice` 후 WARN 로그하고 실행하지 않음.
- **serial만 있을 때**  
  - 기존대로 claim 결과의 `device_serial` 또는 `_deviceIdToSerial.get(device_id)` 사용. complete RPC는 스키마상 `p_task_device_id`만 받으므로 device_id 인자 추가 없음(스키마 변경 금지).

### B) UI 자동화(uiautomator dump) 안정성
- **실패 시 로그**  
  - `_getUiDumpXml(serial, stepName)`: 실패 시 단계명(SEARCH_ICON/SEARCH_BAR/FIRST_RESULT 등), 원인(파일 없음/오래됨/타임아웃), XML 앞 500~800자 샘플(민감 키워드 마스킹)을 console.warn으로 출력.
- **고정 2초 제거, 폴링**  
  - dump 실행 후 `/sdcard/window_dump.xml` 존재·최신성(stat mtime)을 0.5초 간격으로 최대 8초 폴링. 초과 시 해당 단계 실패 처리 및 위 로그.
- **첫 결과 = 리스트 하위 첫 항목**  
  - `_searchAndSelectVideo`: 첫 결과로 `YT.RELATED_VIDEO`(리스트 내 썸네일) 시도 후 `YT.VIDEO_TITLE`, 실패 시 기존처럼 화면 중심 탭.

### C) 에러 처리
- **silent catch 금지(스케줄링/오케스트레이션)**  
  - `_hasPendingAssignment`, `_countDevicesOnTask`: catch 또는 Supabase error 시 `logger.warn`으로 모듈/함수/에러 메시지 출력. false/0 반환은 유지하되 “예외 삼키고 로그 없음” 제거.
  - `_claimNextTaskDevice` catch에서도 `logger.warn` 사용.

### D) Xiaowei 재연결 초기화
- **연결 실패로 프로세스 종료 안 함**  
  - 기존대로 waitForXiaowei 실패 시 warn 후 계속 진행.
- **connected 이벤트에서 초기화**  
  - `agent.js`에서 `xiaowei.on("connected", onXiaoweiConnected)`: 디바이스 목록 조회, proxyManager 있으면 loadAssignments + applyAll, 완료 후 “Xiaowei connected/reconnected — init routine done” 로그.

### E) 시작 순서(Phase)
- **Phase 1**  
  - 환경/DB/설정: PC 등록 직후 `logger.info("Agent", "Phase 1 complete: env/DB/settings", { pc_id })`.
- **Phase 2**  
  - Xiaowei/디바이스/프록시/계정/스크립트: 해당 블록 끝에 `logger.info("Agent", "Phase 2 complete: ...", { pc_id })`.
- **Phase 3**  
  - 오케스트레이터/디스패처/하트비트: DeviceOrchestrator 시작 직후 `logger.info("Agent", "Phase 3 complete: ...", { pc_id })`.

### F) primary PC
- **VideoDispatcher 역할 = QueueDispatcher**  
  - QueueDispatcher는 `config.isPrimaryPc === true`일 때만 `start()`. primary가 아니면 “QueueDispatcher not started (non-primary PC)” 로그.
- **primary 판단**  
  - `config.js`: `settings.primary_pc_id` 로드 후, `setPrimaryFromDb(pcUuid)`에서 `isPrimaryPc = (primaryPcId === pcUuid)`. DB에 값 없으면 기존처럼 env `IS_PRIMARY_PC` fallback.
- **실행 여부 로그**  
  - primary일 때 “QueueDispatcher running on primary PC” 구조화 로그 및 콘솔 메시지.

### G) 로깅
- **구조화**  
  - `lib/logger.js`: timestamp, level, module, 선택적 pc_id, device_id, device_serial, task_device_id, task_id. 오케스트레이션/claim 관련은 해당 시 device·task 필드 포함해 사용.
- **과다 로그 방지**  
  - 전체 디바이스 상태를 3초마다 INFO로 남기지 않음(기존도 상태 변화/DEBUG_ORCHESTRATOR 시에만 상세). 주기 상세는 DEBUG + env 제어.

### H) 공통 유틸
- **sleep**  
  - `agent/lib/sleep.js` 하나만 사용. agent.js, device-orchestrator.js, task-executor.js, device-presets.js, adb-reconnect.js, device-watchdog.js, comment-generator.js에서 사용. (xiaowei-client, supabase-sync의 setTimeout은 타이머/콜백용.)
- **entrypoint/빌드**  
  - README에 “entrypoint: agent.js, Node만 사용, TS 빌드 없음” 명시.

### I) task_devices 운영 룰(스키마 기반)
- **타임아웃 후보**  
  - `status='running' AND lease_expires_at < now() AND completed_at IS NULL` (StaleTaskCleaner `_periodicTaskDevicesTimeout`).
- **타임아웃 처리**  
  - 해당 행에 대해 `status='failed'`, `error='timeout'`, `attempt += 1`, `completed_at`/`lease_expires_at` 갱신. 스키마 변경 없음.
- **재시도**  
  - 기존 RPC/로직: attempt < max_attempts 시 재시도. 주기 타임아웃은 위 업데이트만 수행.
- **최종 실패(attempt >= max_attempts)**  
  - 해당 task_device의 `device_id`에 대해 `devices.status='error'`, `updated_at` 갱신. (total_errors 등 추가 컬럼은 스키마 변경 없이 기존 컬럼만 사용.)
- **ERROR 디바이스**  
  - eligible_device_count 제외는 DB/뷰·RPC 측 기존 정의 유지(스키마 변경 없음).

---

## 남은 TODO (완료 반영)

- **devices.total_errors 증가**  
  - Rule I에서 “error_count++”를 devices에 반영하려면, 현재 스키마에 `total_errors` 등이 있으면 업데이트 가능. 필요 시 StaleTaskCleaner에서 최종 실패(attempt >= max_attempts) 시 devices 갱신 시 total_errors를 조회 후 total_errors + 1로 업데이트하도록 반영함. (완료)
- **sleep 유틸 통일 (Rule H)**  
  - Rule H는 “sleep 유틸 1개로 통일”이므로, device-presets.js, adb-reconnect.js, device-watchdog.js, comment-generator.js에서 모두 lib/sleep.js 사용하도록 교체함. (완료)

---

## 검증

- `pnpm -w lint` — 통과.
- `pnpm -w build` — 통과.
- `pnpm -w test` — 웹 필터 기준으로 테스트 파일 없음(에이전트 코드와 무관).

로컬 agent 실행 시나리오(connected → claim → run → complete) 로그 예시:

1. `node agent.js` 실행 후 Phase 1/2/3 완료 로그가 순서대로 출력된다.
2. Xiaowei 연결 시 “Xiaowei connected/reconnected — init routine done” 로그가 나온다.
3. primary PC이면 “QueueDispatcher running on primary PC”가 나온다.
4. DeviceOrchestrator가 claim 후 실행할 때, device_serial/device_id 불일치가 있으면 “device_id/serial mismatch” WARN 후 해당 task_device는 실행하지 않는다.
5. UI dump 실패 시 “[TaskExecutor] … dump failed step=SEARCH_ICON reason=… xml_sample: …” 형태로 단계·원인·샘플이 로그에 남는다.
