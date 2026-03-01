# Operations Queue & Scheduling Spec

운영 시스템의 스케줄링/큐 규칙 정리. **DB 스키마 변경 금지** — 기존 테이블/컬럼/값으로만 매핑.

---

## 1. SSOT: task_devices

- **디바이스 단위 실행 상태의 단일 기준(SSOT)은 `task_devices` 테이블이다.**
- 실행 중/대기/완료/실패는 모두 `task_devices` 한 행으로 표현한다.
- 참고: 코드/타입에서는 `task_devices`(복수)로 통일; 요구사항 문서에서의 "tasks_device"는 이 테이블을 가리킨다.

---

## 2. tasks: ACTIVE는 항상 1개

- **대기열에서 “현재 제공 중인” task는 언제나 1개만 ACTIVE 상태로 유지한다.**
- 규칙:
  - 대기열에서 **가장 오래된 task 1개만** `tasks.status` = 활성 상태(아래 매핑 참고).
  - 그 외 모든 task는 활성 상태가 아님(status ≠ 활성).
  - **여러 개를 동시에 “활성”으로 두지 않는다.** (“task 제공” 건수를 세지 않음.)
- **ASSUMPTION:**  
  - DB enum `task_status`: `pending | running | success | failed | retrying | cancelled`.  
  - “ACTIVE” = **`tasks.status = 'running'`** 으로 해석. (숫자 1이 아닌 enum 값 사용.)
  - 따라서 “실제로 실행 중인(소비 중인) task”는 **최대 1개** → `tasks.status = 'running'` 인 행은 0 또는 1개.

---

## 3. PC 단위 동시 실행 슬롯: 최대 20

- **한 PC당 동시 실행 슬롯은 최대 20개.**
- 규칙:
  - `running_count` = 해당 PC에서 현재 실행 중인 `task_devices` 수(status = 'running' 등).
  - `target` = `min(20, eligible_device_count)` (해당 PC의 스케줄링 가능 디바이스 수, 상한 20).
  - **`running_count < target` 이면 즉시 보충.**  
    예: 19 → 1개, 18 → 2개 보충해서 20(또는 eligible 상한) 유지.
- **ASSUMPTION:**  
  - `running_count`는 **task_devices**에서 해당 PC(pc_id) 기준 `status IN ('running', 'claimed' 등 실행 중 상태)` count로 산출.  
  - `eligible_device_count`는 해당 PC의 devices 중 스케줄링 대상(예: online/busy 제외 error 등) 수.  
  - 기존 뷰: `pc_device_summary.running_count` 존재 시 해당 값 사용 가능.  
  - workers 테이블 `device_capacity`(또는 max_devices)가 20이면 target 상한 20과 일치.

---

## 4. task → task_devices 공급: 1건씩

- **보충 시점에 ACTIVE task를 task_devices로 “변환/할당”할 때, 슬롯이 비었을 때만 1건씩 생성/활성화한다.**
- 규칙:
  - 한 번에 디바이스 수만큼 fan-out 하지 않음.
  - **필요한 만큼만** 1건씩 공급(claim 또는 insert 1 row per slot freed).
- 구현: `claim_task_devices_for_pc(runner_pc_*, max_to_claim)` 등으로 PC가 슬롯 비었을 때 1건씩 claim.

---

## 5. Timeout / Retry / FAILED_FINAL / error 전환

- **Timeout:**  
  명령 전송 후 **20분** 초과 시 해당 task_device는 **TIMEOUT** 처리.
  - DB: `fn_timeout_tasks_and_task_devices()`가 task_devices를 `status = 'failed'`, `error = 'Task device timeout: exceeded 20 minutes'` 등으로 갱신.
  - **ASSUMPTION:** TIMEOUT인지 구분은 `error` 메시지 또는 별도 플래그가 없으면 “timeout” 문자열 포함 여부로 유추.
- **Retry:**  
  - 재시도 **최대 3회**. (task_devices.max_attempts 기본 3, attempt 증가.)
  - `fail_or_retry_task_device` RPC: attempt < max_attempts → status = 'pending'(재시도), else → status = 'failed'.
- **FAILED_FINAL:**  
  - 재시도 초과 시 **FAILED_FINAL**로 간주.  
  - DB에는 별도 enum 없음 → **task_devices.status = 'failed' 이면서 attempt >= max_attempts** 인 경우로 정의.
- **디바이스 error 전환:**  
  - FAILED_FINAL 발생 시 해당 **디바이스는 error 타입으로 전환**, 스케줄링 eligible에서 제외(공백 발생).
  - **ASSUMPTION:** devices.status = 'ERROR'(또는 'error')로 설정하는 트리거/RPC가 있다고 가정. 없으면 별도 TODO.

---

## 6. tasks_event: 역할 / 상태 / attempt

- **tasks_event는 task_devices의 “시도(Attempt) 기록/히스토리” 개념이다. SSOT는 아니다.**
- **ASSUMPTION:**  
  - 현재 스키마에 **`tasks_event` 테이블 이름으로 된 테이블은 없음.**  
  - 시도 히스토리는 (1) **execution_logs** (start/completed/failed 등) 또는 (2) **task_devices.attempt + status 변경**으로 유추.
- 원칙:
  - 재시도 1회마다 “시도” 1건을 남긴다(가능하면 attempt_no로 구분).
  - 상태 집합(또는 event_type 매핑):
    - CREATED, SENT, ACKED(선택), SUCCEEDED, FAILED, TIMEOUT, RETRY_SCHEDULED(선택), FAILED_FINAL
- **ASSUMPTION:**  
  - execution_logs에 event_type/level이 있으면 매핑.  
  - 없으면 task_devices.status + error 텍스트로 CREATED→running, SUCCEEDED→completed, FAILED/TIMEOUT/FAILED_FINAL→failed 등으로 해석.

---

## 7. 기존 컬럼/값 매핑 요약

| 개념 | 기존 테이블/컬럼/값 |
|------|----------------------|
| ACTIVE task(1개) | tasks.status = 'running' (0 or 1 row) |
| 디바이스 단위 실행 | task_devices (status, attempt, max_attempts, error, completed_at) |
| PC별 실행 수 | task_devices.pc_id별 count; 또는 pc_device_summary.running_count(뷰 존재 시) |
| Target 상한 20 | workers.device_capacity / max_devices 또는 상수 20 |
| 20분 타임아웃 | fn_timeout_tasks_and_task_devices (started_at + 20 min 또는 timeout_at) |
| 재시도 3회 | task_devices.max_attempts (기본 3), attempt |
| FAILED_FINAL | task_devices.status = 'failed' AND attempt >= max_attempts |
| TIMEOUT | task_devices.error에 'timeout' 포함 등으로 유추 (별도 컬럼 없음) |
| 시도 히스토리 | execution_logs 또는 task_devices.attempt (tasks_event 테이블 없음) |
| 디바이스 error | devices.status = 'ERROR' / 'error' |

---

## 8. ASSUMPTION 목록

- tasks “ACTIVE” = tasks.status = 'running'. (숫자 1 아님.)
- running_count / target / eligible_device_count: pc_device_summary 또는 task_devices 집계. API에 없으면 stub+TODO.
- TIMEOUT 구분: error 텍스트 또는 별도 컬럼 없으면 “timeout” 문자열로 유추.
- FAILED_FINAL: status='failed' && attempt >= max_attempts.
- tasks_event: 테이블 없음. execution_logs 또는 task_devices로 시도 히스토리 유추.
- FAILED_FINAL 시 디바이스 → error 전환: 트리거/RPC 존재 가정; 없으면 TODO.

---

## 9. TODO 목록 (스키마/API 변경 없이 필요한 정보)

| 항목 | 설명 |
|------|------|
| PC별 running_count API | pc_device_summary 또는 task_devices 집계 노출 시 UI에서 stub 제거 가능. |
| TIMEOUT 전용 플래그/컬럼 | task_devices에 timeout 여부 컬럼 없음 → error 텍스트 파싱 또는 신규 컬럼(스키마 변경 시). |
| FAILED_FINAL → device error | 디바이스 상태 전환 트리거/프로시저 유무 확인 및 문서화. |
| tasks_event 테이블 | 없음. 시도별 행이 필요하면 execution_logs 확장 또는 별도 테이블 검토(스키마 변경 시). |
| tasks.status 'completed' vs 'success' | DB enum은 'success'; 일부 API는 'completed' 사용. 실제 저장값 확인. |
