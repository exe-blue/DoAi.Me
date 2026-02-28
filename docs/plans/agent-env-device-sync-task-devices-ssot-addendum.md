# 계획 추가분: task_devices SSOT 및 플로우 검증

아래 내용은 `agent_env_and_device_sync_fix` 계획의 **섹션 6·7**으로, 이전 응답과 합쳐 실행할 때 반영한다.

---

## 6. task_devices 단일 기준(SSOT) — 모든 태스크의 기본 단위

**원칙**: 모든 태스크의 기본은 **task_devices**로 시작한다. 최초 PC가 서버에서 명령을 수신한 뒤 나누는 단위가 **task_devices** 한 행이며, 나머지 데이터와 실행은 이 단위에 맞춰 정렬된다.

**목표**:

- **SSOT**: 실행·진행·완료/실패의 기준은 `task_devices` 테이블 한 행(task_device)이다.
- 서버: `tasks` 생성 후 곧바로 `task_devices`를 생성(디바이스별 1행). PC는 **task**를 직접 실행하지 않고, **task_device**를 claim하여 실행한다.
- 에이전트: PC에서 작업 수신·선점·실행의 단위는 항상 **task_device** (claim → `runTaskDevice(taskDevice)`). 이전 버전의 **job_assignment**를 사용하는 코드/문서/명령은 **task_devices** 플로우로 수정한다.

**정리할 참조**:

- 코드·문서에서 **job_assignment(s)** 를 주 경로로 설명하거나 쿼리하는 부분 → **task_devices** 기준으로 수정.
- 단일 행을 부를 때 **task_device** (단수)로 기재되어 있으면 "task_devices 테이블의 한 행"임을 명확히 하면 되며, RPC 이름(`claim_next_task_device`, `complete_task_device` 등)은 유지 가능.

---

## 7. 플로우 검증 — task_devices 기준으로 진행되는지 체크

**기대 플로우**:

- 서버가 `tasks`를 넣은 뒤, 동일 작업을 디바이스 단위로 나눈 **task_devices** 행을 넣는다.
- 에이전트는 **tasks** 테이블 구독/폴링으로 "task 하나 실행"하는 대신, **task_devices**를 claim하여 **한 행씩** `runTaskDevice(taskDevice)`로 실행한다.
- 진행/완료/실패는 `task_devices.status` 및 RPC `complete_task_device` / `fail_or_retry_task_device`로 반영한다.

**검증 체크리스트**:

1. **생성**: 작업 생성 API/크론이 `tasks` 삽입 후 `task_devices`를 삽입하는지 확인. (`lib/pipeline.ts`의 createManualTask / createBatchTask 등은 이미 task_devices insert 사용.)
2. **에이전트 실행 경로**: DeviceOrchestrator가 `claim_task_devices_for_pc` 또는 `claim_next_task_device`로 **task_device** 한 행을 받아 `taskExecutor.runTaskDevice(taskDevice)`만 호출하는지 확인. (현재 구현됨.)
3. **이중 경로 정리**: `agent.js`의 subscribeToBroadcast/subscribeToTasks + getPendingTasks는 **tasks** 행을 넘기고 `taskExecutor.execute(task)`를 호출함. SSOT가 task_devices라면, 이 경로는 (a) 제거하고 DeviceOrchestrator·task_devices claim만 사용하거나, (b) task 수신 시 해당 task에 대한 task_devices만 생성/보강하고 실행은 전부 claim → runTaskDevice로만 하도록 정책 정리.

   **선택한 접근 방식: (a)**  
   agent.js는 이미 tasks 테이블 구독/폴링 및 `taskExecutor.execute(task)` 경로를 사용하지 않으며, DeviceOrchestrator의 `claim_task_devices_for_pc` / `claim_next_task_device` → `runTaskDevice(taskDevice)` 단일 경로만 사용한다(주석: "Task execution: DeviceOrchestrator only (task_devices claim → runTaskDevice). No tasks-table subscription/poll."). (a)를 선택한 이유: 코드베이스가 이미 (a)를 반영하고 있어 별도 제거 작업이 없으며, 단일 실행 경로로 복잡도와 이중 실행 위험을 줄이고 task_devices SSOT를 유지할 수 있음.
4. **job_assignment 참조 제거/대체**:
   - `agent/dashboard/service.js`: `job_assignments` 쿼리 → task_devices(또는 그에 대응하는 뷰/집계) 기반으로 통계/목록 조회로 변경.
   - `agent/MODULES.md`: claim_next_assignment, job_assignments 설명을 claim_task_devices_for_pc / claim_next_task_device, task_devices 기준으로 수정.
   - `agent/README.md`, `agent/docs/module-contracts.md`, `agent/docs/AGENT_CRITICAL_REVIEW.md`, `agent/docs/CODE_REVIEW_DETAILED.md`: job_assignment 및 claim_next_assignment 언급을 task_devices·claim_next_task_device 플로우로 통일.
   - `agent/docs/engagement-system-design.md`, phase 커서 프롬프트 등: job_assignments 테이블 예시/설명이 있으면 task_devices 기준으로 수정 또는 "레거시" 표기.

**실행 후 확인**: 에이전트 기동 → Heartbeat로 devices 반영 → DeviceOrchestrator가 task_devices만 claim하여 runTaskDevice가 호출되는지, task 수준 Realtime/execute(task)가 SSOT 원칙에 맞게 비활성화 또는 보조 역할만 하는지 로그/동작으로 확인.
