# Agent 동작·코드 비판적 리뷰

## 1. 아키텍처·데이터 일관성

### 1.1 Job assignment 이중 소비 방지 — OK
- `deviceOrchestrator`가 있으면 `taskExecutor.startJobAssignmentPolling()`을 **호출하지 않음** (agent.js 323–328).
- 따라서 assignment는 **DeviceOrchestrator → claim_next_assignment → TaskExecutor 실행** 한 경로만 사용됨. 중복 실행 위험 없음.

### 1.2 claim_next_assignment 2인자 vs 3인자 — 일관성 문제
- **현재:** DeviceOrchestrator는 `claim_next_assignment(p_pc_id, p_device_serial)` 2인자 RPC만 사용.
- **DB:** VideoDispatcher는 insert 시 `device_id`(devices.id)를 넣고, `device_serial`은 null. RPC는 `device_serial`만 갱신하고 **device_id는 그대로** 둠.
- **결과:** 디바이스 B(serial)가 claim하면 row는 `device_id=A`, `device_serial=B`가 될 수 있음. “어떤 기기가 완료했는지” 통계가 device_id 기준이면 잘못됨.
- **권장:** `claim_next_assignment(p_pc_id, p_device_id, p_device_serial)` 3인자 버전을 쓰고, claim 시 **device_id도 갱신**하도록 하거나, 최소한 DeviceOrchestrator에서 serial→device_id 매핑 후 3인자 호출.

### 1.3 DeviceOrchestrator ↔ TaskExecutor API
- DeviceOrchestrator는 `this.taskExecutor.runAssignment ?? this.taskExecutor._executeJobAssignment` 호출.
- TaskExecutor에는 **runAssignment가 없음**. 항상 `_executeJobAssignment`만 호출됨. 동작은 맞지만, 공개 API(`runAssignment`)로 의도했다면 구현이 비어 있음.
- **권장:** TaskExecutor에 `runAssignment(assignment) { return this._executeJobAssignment(assignment); }` 추가하거나, Orchestrator에서 `_executeJobAssignment`만 직접 호출하고 `runAssignment` 분기 제거.

---

## 2. 검색·UI 자동화 (task-executor.js)

### 2.1 UI dump 의존성
- 검색 아이콘/입력창/첫 결과 모두 **uiautomator dump → regex로 bounds 파싱**에 의존.
- **한계:**
  - XML 속성 순서가 바뀌면 (예: `bounds`가 `content-desc` 앞에 오는 경우) 일부 패턴만 매칭됨. 이미 bounds 앞에 오는 패턴을 넣었지만, 속성 사이에 다른 속성이 끼면 실패 가능.
  - YouTube 앱 업데이트로 resource-id/content-desc가 바뀌면 전부 깨짐.
  - `cat /sdcard/ui.xml`이 여러 화면/창이 합쳐진 dump일 수 있어, “첫 번째 결과”가 의도한 영상이 아닐 수 있음 (video_title이 여러 개일 때).
- **권장:** 패턴 실패 시 로그에 xml 조각(예: 500자) 남기기. 주기적으로 실제 dump 샘플로 regex 검증. 가능하면 “검색 결과 리스트의 첫 번째 항목”을 더 좁은 범위(부모 노드)로 한정.

### 2.2 dump 대기 시간 하드코딩
- `_findAndTapSearch`, `_findAndTapSearchBar`, `_findAndTapFirstResult`에서 dump 후 **무조건 2초** 대기.
- 기기/부하에 따라 dump가 2초 안에 안 끝나면 이전 화면 dump를 읽을 수 있음.
- **권장:** 파일 존재·최신성 확인 후 읽기, 또는 짧은 폴링(예: 0.5초 간격, 최대 5초) 후 cat.

### 2.3 검색 실패 시 처리
- 검색 실패 시 `throw new Error("Search failed")`로 assignment failed 처리하고, direct URL 폴백 제거된 상태는 **의도에 맞음**.
- 다만 사용자 경험상 “한 번 실패하면 재시도 없이 실패”이므로, 필요하면 **재시도 1회(예: Step 0부터 재실행)** 를 옵션으로 두는 것도 고려 가능.

---

## 3. 에러 처리·안정성

### 3.1 조용한 실패 (silent catch)
- **VideoDispatcher:** `_processNewVideos` 내부 다수 Supabase/로직 실패가 `return` 또는 `continue`만 하고, 상위에는 에러를 전파하지 않음. 한 번 실패해도 다음 주기에 다시 시도하므로 치명적이진 않으나, **실패 원인 로그가 부족**함.
- **DeviceOrchestrator:** `_hasPendingAssignment`, `_countDevicesOnJob`에서 `catch { return false; }` / `return 0`로 에러를 삼킴. 네트워크/DB 일시 오류 시 “pending 없음”으로 잘못 판단해 free_watch로 빠질 수 있음.
- **권장:** 최소한 `console.warn('[Module] operation failed', err.message)` 수준 로그 추가. 중요한 경로(claim, pending 여부)는 실패 시 재시도 또는 상위로 전파 검토.

### 3.2 Xiaowei 미연결 시
- agent.js에서 Xiaowei 연결 실패 시 **process.exit 하지 않고** “Xiaowei will auto-reconnect”만 로그하고 계속 진행.
- VideoDispatcher/DeviceOrchestrator/Heartbeat 등이 `xiaowei.connected`를 보지만, **연결 전에 이미 시작된 폴링/구독**은 매번 early return만 할 뿐, “연결됐을 때 한 번 초기화” 같은 로직은 없음. 재연결 후 정상 동작하는지는 구현에 의존.
- **권장:** Xiaowei `connected` 이벤트에서 “첫 연결/재연결 시” 필요한 모듈(예: DeviceOrchestrator 상태, proxy 재적용) 한 번 동기화하는지 명시적으로 점검.

---

## 4. 설정·시작 순서

### 4.1 시작 단계 수
- agent.js main()이 **16단계 이상**으로 길고, 단계 번호(5, 5a, 6, 7, … 15, 15b, 13a, 16)가 순서와 불일치(13a가 15b 다음에 옴).
- 의존 관계(예: heartbeat → device 상태 동기화 → orchestrator)가 코드만으로는 한눈에 들어오지 않음.
- **권장:** “Phase 1: DB/연결”, “Phase 2: Xiaowei/디바이스”, “Phase 3: 폴링/구독”처럼 묶고, 단계 번호를 1,2,3 하위로 정리. 또는 README/ARCHITECTURE에 “Agent startup sequence” 다이어그램 추가.

### 4.2 isPrimaryPc
- VideoDispatcher는 **primary PC에서만** start. 다른 PC는 assignment를 만들지 않음. 정책상 맞음.
- 다만 “primary” 선정이 **env(IS_PRIMARY_PC)만** 보고, DB나 다른 소스와 불일치할 수 있음. 여러 PC가 실수로 primary=true면 VideoDispatcher가 중복 기동할 수 있음.
- **권장:** 가능하면 primary 여부를 DB(pcs 또는 settings)에서 읽어오고, env는 fallback으로만 사용.

---

## 5. 로깅·운영성

### 5.1 로그 포맷
- `[TaskExecutor]`, `[VideoDispatcher]`, `[Orchestrator]` 등 모듈 prefix는 있으나, **타임스탬프·레벨(INFO/WARN/ERROR)** 이 없어 수집/필터링 시 불리함.
- **권장:** 단일 logger 유틸(예: winston 또는 pino)로 통일하고, `level`, `module`, `message`, `serial`(해당 시) 정도는 구조화 로그로 출력.

### 5.2 디버그 로그 과다
- DeviceOrchestrator가 **3초마다** 모든 디바이스에 대해 `status=… busy=…` 로그를 남김. 디바이스 수가 많으면 로그가 매우 많아짐.
- **권장:** 기본은 info 수준에서 “변경 시에만” 로그하고, 상세 주기는 debug 레벨 또는 환경 변리로 켜기.

---

## 6. 기술 부채·일관성

### 6.1 sleep 함수 중복
- agent.js: `function sleep(ms)`.
- task-executor.js: `function _sleep(ms)`.
- device-orchestrator.js: `const _sleep = (ms) => new Promise(...)`.
- **권장:** 공통 유틸(예: `lib/sleep.js`) 하나로 통일하고 require로 사용.

### 6.2 JS vs TS 혼재
- agent 쪽은 대부분 **.js**. `src/` 아래에 .ts 파일(agent.ts, broadcaster.ts 등)이 있고, 컴파일/실제 진입점이 agent.js인지 agent.ts 빌드 결과인지 문서화되어 있지 않으면 유지보수 시 헷갈림.
- **권장:** “실제 실행 진입점은 agent.js” 등을 ARCHITECTURE 또는 README에 명시하고, 점진적으로 TS 이전 시에도 진입점·의존 관계를 문서에 유지.

### 6.3 Supabase 클라이언트
- SupabaseSync는 service role이 있으면 **supabase를 admin 클라이언트로 통일**. RLS를 우회하므로, 이 에이전트가 “신뢰할 수 있는 서버 컴포넌트”라는 전제가 맞는지 정책상 확인 필요.
- **권장:** “Agent는 service role 사용, RLS 우회”를 문서에 명시하고, 감사 로그가 필요하면 중요 mutation은 별도 로깅 검토.

---

## 7. 요약·우선순위

| 우선순위 | 항목 | 위험도 | 권장 |
|----------|------|--------|------|
| 높음 | claim 2인자 → device_id 불일치 | 중 | 3인자 RPC 사용 또는 claim 시 device_id 갱신 |
| 높음 | UI dump 실패 시 원인 파악 어려움 | 중 | 실패 시 xml 조각 로그, 패턴 주기 검증 |
| 중간 | 조용한 catch로 인한 잘못된 판단 | 중 | 최소 warn 로그, 중요 경로는 재시도/전파 검토 |
| 중간 | DeviceOrchestrator runAssignment 분기 | 낮 | runAssignment 구현 추가 또는 분기 제거 |
| 낮음 | 시작 단계/번호 정리 | 낮 | Phase 구분·문서화 |
| 낮음 | sleep/로거 통일 | 낮 | 공통 유틸·구조화 로그 도입 |

전반적으로 **Realtime + Xiaowei + 단일 PC Agent** 구조는 프로젝트 규칙과 맞고, assignment 이중 소비도 막혀 있음. 가장 손댈 가치가 큰 부분은 **claim 시 device_id 일관성**과 **검색/UI 자동화 실패 시 관찰 가능성**이다.
