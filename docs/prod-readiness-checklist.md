# 프로덕션 적용 전 체크리스트

실행 가능한 작업 단위로 정리. 프로덕션 배포 전에 완료하거나 검토한다.

---

## 1) agent.js 통합 (새 모듈 연결 및 시퀀스)

**목표**: 새 모듈들을 `agent/agent.js`의 require 경로와 startup sequence에 명확히 반영.

| 단계 | 작업 | 상태 |
|------|------|------|
| 1.1 | `agent/agent.js`에서 사용하는 모든 모듈 목록 문서화 (require 목록 + Phase별 초기화 순서) | 문서화 필요 |
| 1.2 | Phase별 startup sequence 문서화 (Phase 1: env/DB/settings, Phase 2: Xiaowei/device, Phase 3: orchestrator/dispatcher) | AGENTS.md 또는 본 문서에 유지 |
| 1.3 | `orchestrator/models`는 agent.js에서 직접 require하지 않음 — QueueDispatcher/ScheduleEvaluator 생성 시 supabase 전달로 내부 사용 | 완료 (현재 구조 유지) |

**산출물**: `docs/agent-startup-sequence.md` 또는 AGENTS.md 보강.

---

## 2) E2E 실기기 테스트 계획

**목표**: executeYouTubeMission 전체 플로우를 Galaxy S9 등 실기기에서 검증.

| 단계 | 작업 | 상태 |
|------|------|------|
| 2.1 | 체크 포인트 정의 (예: 기기 연결 → 태스크 할당 → 재생 시작 → 진행률 업데이트 → 완료) | 정의 필요 |
| 2.2 | 성공 조건 정의 (예: task_devices 상태 전이, 로그에 특정 메시지 존재) | 정의 필요 |
| 2.3 | 로그 수집(진단 zip) 기준 및 수집 방법 문서화 | 정의 필요 |
| 2.4 | Galaxy S9에서 1회 수동 또는 스크립트 기반 E2E 실행 및 결과 기록 | 실행 필요 |

**산출물**: `docs/e2e-device-test-plan.md` 또는 기존 테스트 디렉터리 내 계획서.

---

## 3) 레거시 코드 제거 계획

**원칙**: yt-player.js, yt-actions.js 등 레거시는 이번 PR에서 삭제하지 않는다. “_archive 이동 또는 통합 시점”을 문서에 명확히 남긴다.

| 단계 | 작업 | 상태 |
|------|------|------|
| 3.1 | 레거시로 간주하는 파일 목록 작성 (예: yt-player.js, yt-actions.js, 기타 _archive 외 산재 파일) | 목록 작성 필요 |
| 3.2 | 각 항목에 대해 “_archive 이동 시점” 또는 “통합 후 제거 시점” 정의 | 정의 필요 |
| 3.3 | 실제 삭제/이동은 별도 PR에서 수행 | — |

**산출물**: `docs/legacy-cleanup-plan.md` 또는 본 문서의 “레거시 제거 계획” 섹션 유지.

---

## 후속 작업 체크리스트 (낮은 우선순위)

| 항목 | 설명 | 담당 |
|------|------|------|
| config.js console.log → lazy logger | 설정 출력 등 console.log를 lazy logger 도입 후 전환 | 선택 |
| adb/client.js 하드코딩 좌표 | selectors.js의 COORDS 참조로 이동 | 선택 |
| 순환 의존성 검사 CI | madge 등으로 agent/ 대상 cycle 검사 스크립트 추가 | 선택 |

---

## 프로덕션 배포 직전 확인

- [ ] `npm run agent:smoke` 통과 (agent 디렉터리에서 `npm install` 후)
- [ ] `npm test` 24/24 통과
- [ ] `npm run lint` warning/error 0
- [ ] 위 1)~3) 항목 중 “필수”로 표시된 문서/정의 완료 여부 검토
