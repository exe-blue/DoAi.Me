# 모듈 상태 점검 요약 (2026-02-25)

## 유지해야 할 불변 조건 (회귀 방지)

다음 조건이 깨지면 안 됩니다.

| # | 조건 | 검증 방법 |
|---|------|-----------|
| 1 | 모듈 Import 테스트 9/9 통과 | `npm run agent:smoke` (root) 또는 `cd agent && node scripts/smoke-require-agent.js`. agent에서 `npm install` 선행 필요. |
| 2 | 순환 의존성 0 | 수동/CI: agent 내 require 그래프에서 cycle 없음. (선택: madge 등 도구) |
| 3 | 단독 실행 | `node agent/config.js` → 설정 출력; `node agent/lib/logger.js` → 콘솔+파일 출력, 마스킹 유지 |
| 4 | Vitest 24/24 pass | `npm test` (root, web filter) |
| 5 | ESLint warning/error 0 | `npm run lint` |
| 6 | TODO/FIXME 주석 0 | grep 등으로 확인 |

## 적용한 개선 (2026-02-25)

- **중: orchestrator/queue 직접 DB 접근 제거**
  - `agent/orchestrator/models.js` 신규: task_queue 및 tasks에 대한 CRUD만 담당. `.from()` 호출은 이 파일에만 존재.
  - `agent/scheduling/queue-dispatcher.js`: 모든 task_queue/tasks 접근을 `createTaskQueueModels(supabase)` 통해 수행. 직접 `.from()` 없음.
  - `agent/scheduling/schedule-evaluator.js`: task_queue/tasks 접근을 동일 models 레이어로 이전. task_schedules는 기존처럼 해당 파일 내 `.from("task_schedules")` 유지.

## 회귀 방지 스크립트

- **모듈 require smoke test**: `npm run agent:smoke`  
  - 9개 모듈: config, lib/logger, lib/sleep, orchestrator/models, scheduling/queue-dispatcher, scheduling/schedule-evaluator, core/supabase-sync, device/heartbeat, task/task-executor  
- **순환 의존성**: 도구 추가 시 madge 등으로 `agent/` 대상 검사 권장. 현재는 smoke test만 필수.

## 선택적 후속 작업 (낮은 우선순위)

- config.js의 console.log → lazy logger 도입 후 전환
- adb/client.js 하드코딩 좌표 → selectors.js의 COORDS 참조로 이동
