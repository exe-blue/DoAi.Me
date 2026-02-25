# 프로젝트 정리 보고서 — DoAi.Me

> 생성일: 2026-02-25
> ⚠️ 이 보고서는 분석 결과만 포함합니다. 파일 삭제/이동은 하지 않았습니다.

---

## 1. DEAD FILES (삭제 후보)

| 파일 | 이유 |
|------|------|
| `tests/test_tasks.py` | FastAPI 테스트 — 프로젝트는 Next.js API Routes 사용, FastAPI 금지 규칙. 어디서도 참조 안 됨 |
| `agent/src/agent.ts.bak` | `update_agent_v3.sh`가 만든 백업. 원본 `.ts`도 미사용 |
| `agent/src/config.ts.bak` | 위와 동일 |
| `agent/src/supabase-sync.ts.bak` | 위와 동일 |
| `agent/src/broadcaster.ts.bak` | 위와 동일 |
| `update_agent_v3.sh` | 마이그레이션 스크립트, `.bak` 생성용. 1회성 작업 완료 후 불필요 |
| `fix_agent_v3.sh` | 위와 동일, 1회성 패치 스크립트 |

---

## 2. UNUSED (미사용 — TypeScript 마이그레이션 잔재)

Agent는 CommonJS (`agent/*.js`)로 실행됨. TypeScript 버전은 빌드되지만 실제 프로덕션에서 사용 안 됨.

| 파일 | 상태 | 설명 |
|------|------|------|
| `agent/src/agent.ts` | 미사용 | `agent/agent.js`가 실제 엔트리포인트 |
| `agent/src/config.ts` | 미사용 | `agent/config.js`가 실제 사용 |
| `agent/src/supabase-sync.ts` | 미사용 | `agent/supabase-sync.js`가 실제 사용 |
| `agent/src/xiaowei-client.ts` | 미사용 | `agent/xiaowei-client.js`가 실제 사용 |
| `agent/src/broadcaster.ts` | 미사용 | `agent/dashboard-broadcaster.js`가 실제 사용 |
| `agent/src/logger.ts` | 미사용 | TS 파일에서만 import |
| `agent/src/__tests__/xiaowei.e2e.test.ts` | 미사용 | TS agent 대상 E2E 테스트 |
| `agent/src/__tests__/supabase-sync.e2e.test.ts` | 미사용 | 위와 동일 |
| `agent/src/__tests__/full-loop.e2e.test.ts` | 미사용 | 위와 동일 |
| `agent/src/__tests__/broadcast.e2e.test.ts` | 미사용 | 위와 동일 |

**판단**: `agent/src/` 전체가 TypeScript 마이그레이션 시도 잔재. 현재 `agent/*.js` (CommonJS)가 프로덕션. TS 파일은 reference용으로 보존하거나, 마이그레이션 완료 시까지 `_archive/` 이동 가능.

---

## 3. DUPLICATE FILES (통합 후보)

### docs/docs/ — docs/의 완전 복제본

| 원본 | 복제본 |
|------|--------|
| `docs/architecture.md` | `docs/docs/architecture.md` |
| `docs/ENV.md` | `docs/docs/ENV.md` |
| `docs/FOLDER_STRUCTURE.md` | `docs/docs/FOLDER_STRUCTURE.md` |
| `docs/IMPLEMENTATION_PLAN.md` | `docs/docs/IMPLEMENTATION_PLAN.md` |
| `docs/known-issues.md` | `docs/docs/known-issues.md` |
| `docs/xiaowei-api.md` | `docs/docs/xiaowei-api.md` |
| `docs/plans/2026-02-13-*.md` (4개) | `docs/docs/plans/2026-02-13-*.md` (4개) |

**판단**: `docs/docs/` 폴더 전체 삭제 가능. `docs/`가 원본.

### agent/docs/ 중복

| 원본 | 복제본 |
|------|--------|
| `docs/youtube-ui-objects.md` | `agent/docs/youtube-ui-objects.md` |

**판단**: 하나만 유지. `docs/`가 원본이면 `agent/docs/youtube-ui-objects.md` 삭제 가능.

---

## 4. TEST-ONLY FILES (프로덕션 미포함)

agent.js에서 require 안 됨. 테스트 스크립트에서만 사용.

| 파일 | 사용처 | 상태 |
|------|--------|------|
| `agent/yt-player.js` | `scripts/test_full_flow.js` | 프로덕션 통합 대기 |
| `agent/yt-actions.js` | `scripts/test_full_flow.js` | 프로덕션 통합 대기 |
| `agent/comment-generator.js` | `scripts/test_full_flow.js` | 프로덕션 통합 대기 |
| `scripts/test_full_flow.js` | 단독 실행 | 개발 테스트용 |
| `scripts/test_watch_video.js` | 단독 실행 | 개발 테스트용 |
| `scripts/test_engagement.js` | 단독 실행 | 개발 테스트용 |
| `scripts/test_run.js` | 단독 실행 | Xiaowei AutoJS 테스트용 |

**판단**: 삭제 대상 아님. `yt-player.js`, `yt-actions.js`, `comment-generator.js`는 `task-executor.js`에 통합 예정.

---

## 5. ACTIVE FILES (프로덕션 사용 중)

### agent/*.js — agent.js에서 require (15개)

| 파일 | 역할 |
|------|------|
| `agent/agent.js` | 메인 엔트리포인트 |
| `agent/config.js` | 설정 관리 (DB + env) |
| `agent/xiaowei-client.js` | Xiaowei WebSocket 클라이언트 |
| `agent/supabase-sync.js` | Supabase 통합 (가장 많이 import: 11개) |
| `agent/heartbeat.js` | 디바이스 동기화 하트비트 |
| `agent/task-executor.js` | 태스크 실행 엔진 |
| `agent/proxy-manager.js` | 프록시 관리 |
| `agent/account-manager.js` | 계정 관리 |
| `agent/script-verifier.js` | AutoJS 스크립트 검증 |
| `agent/dashboard-broadcaster.js` | 대시보드 실시간 브로드캐스트 |
| `agent/adb-reconnect.js` | ADB 재연결 관리 |
| `agent/queue-dispatcher.js` | 큐 디스패치 |
| `agent/schedule-evaluator.js` | 스케줄 평가 |
| `agent/stale-task-cleaner.js` | 멈춘 태스크 정리 |
| `agent/device-watchdog.js` | 디바이스 상태 감시 |
| `agent/video-dispatcher.js` | 영상 → job 생성 |

### 독립 실행 가능

| 파일 | 역할 |
|------|------|
| `agent/supervisor.js` | 프로세스 감시자 (agent.js 자동 재시작) |

---

## 6. CONFIG FILES

| 파일 | 용도 | 상태 |
|------|------|------|
| `.env.local` | Next.js 환경변수 | ACTIVE (gitignored) |
| `.env.example` | 환경변수 예시 | ACTIVE |
| `agent/.env` | Agent 환경변수 | ACTIVE (gitignored) |
| `agent/.env.example` | Agent 환경변수 예시 | ACTIVE |
| `agent/.env.template` | Agent 환경변수 템플릿 | **DUPLICATE** — `.env.example`과 용도 동일 |

**판단**: `agent/.env.template` 삭제 가능 (`.env.example`로 충분)

---

## 7. 루트 .md 파일 (지시서/가이드)

| 파일 | 용도 | 상태 |
|------|------|------|
| `README.md` | 프로젝트 개요 | ACTIVE |
| `ARCHITECTURE.md` | 아키텍처 상세 | ACTIVE |
| `AGENTS.md` | Cursor Cloud 개발 가이드 | ACTIVE |
| `VIDEO_DISPATCHER_INSTRUCTIONS.md` | video-dispatcher 생성 지시서 | **완료됨** — 구현 후 불필요 |
| `WEBAPP_SCHEMA_FIX.md` | 웹앱 스키마 수정 지시서 | **완료됨** — 적용 후 불필요 |
| `CURSOR_MIGRATION_INSTRUCTIONS.md` | 마이그레이션 지시서 | **완료됨** — 적용 후 불필요 |
| `cursor-prompt-fix-watch-video.md` | Cursor 프롬프트 (영상 시청 수정) | **1회성** — 적용 후 불필요 |
| `cursor-prompt-object-based-ui.md` | Cursor 프롬프트 (UI 오브젝트 기반) | **1회성** — 적용 후 불필요 |

**판단**: 완료된 지시서 5개는 `docs/archive/` 이동 가능

---

## 8. 정리 액션 요약

| 우선순위 | 액션 | 대상 | 파일 수 |
|---------|------|------|--------|
| 🔴 높음 | 삭제 | `docs/docs/` (전체 복제본) | ~10 |
| 🔴 높음 | 삭제 | `agent/src/*.bak` (백업) | 4 |
| 🟡 중간 | 삭제 | `tests/test_tasks.py` (FastAPI 잔재) | 1 |
| 🟡 중간 | 삭제 | `update_agent_v3.sh`, `fix_agent_v3.sh` (1회성) | 2 |
| 🟡 중간 | 삭제 | `agent/.env.template` (중복) | 1 |
| 🟡 중간 | 아카이브 | 완료된 지시서 `.md` 5개 → `docs/archive/` | 5 |
| 🔵 낮음 | 판단 보류 | `agent/src/*.ts` (마이그레이션 잔재) | 6+4 |
| ⚪ 보류 | 프로덕션 통합 | `yt-player.js`, `yt-actions.js`, `comment-generator.js` → `task-executor.js` | 3 |

**총 삭제 후보: ~19개 파일** (코드에 영향 없음)
**통합 예정: 3개 모듈** (`task-executor.js` 리팩토링 시)
