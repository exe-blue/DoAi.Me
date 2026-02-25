# ADR-005: Task Queue & Schedule System

**Status**: Accepted
**Date**: 2026-02-16
**Deciders**: Development Team
**Related Commits**: `7de80b4`

---

## Context

500대 디바이스에서 다양한 태스크를 효율적으로 분배하고, 채널별 스케줄에 따라 자동으로 태스크를 생성해야 합니다.

요구사항:
1. 대기 중인 태스크를 가용 디바이스에 자동 할당
2. 채널별 스케줄 (on_upload, interval, cron) 지원
3. 태스크 우선순위 관리

## Decision

### 1. Queue Dispatcher (Agent 모듈)

```
agent/queue-dispatcher.js
┌─────────────────────────────────────────┐
│  1. Supabase에서 pending 태스크 조회    │
│  2. 가용 디바이스 확인                   │
│  3. 태스크 → 디바이스 매핑               │
│  4. 태스크 상태 running으로 업데이트     │
│  5. task-executor로 전달                │
└─────────────────────────────────────────┘
```

### 2. Schedule Evaluator (Agent 모듈)

```
agent/schedule-evaluator.js
┌─────────────────────────────────────────┐
│  1. schedules 테이블에서 활성 스케줄 조회│
│  2. trigger_type별 평가:                │
│     - on_upload: 새 영상 감지 시        │
│     - interval: interval_minutes 경과 시│
│     - cron: cron_expression 매칭 시     │
│  3. 조건 충족 시 tasks 생성             │
│  4. last_triggered_at 업데이트          │
└─────────────────────────────────────────┘
```

### 3. Dashboard UI

- **Queue Panel**: 대기/실행/완료 태스크 현황
- **Schedules Panel**: 스케줄 목록 및 활성화/비활성화

### 4. API Routes

| Method | Path | 설명 |
|--------|------|------|
| GET/POST | `/api/schedules` | 스케줄 목록/생성 |
| PUT/DELETE | `/api/schedules/[id]` | 스케줄 수정/삭제 |
| PUT | `/api/schedules/[id]/toggle` | 활성화 토글 |

### 5. pg_cron 스케줄 작업

| Job | 주기 | 설명 |
|-----|------|------|
| cleanup-old-task-logs | 매일 03:00 UTC | 30일 이상 로그 삭제 |
| mark-stale-workers-offline | 매 2분 | 5분 이상 heartbeat 없는 워커 offline |
| reset-stuck-tasks | 매 10분 | 1시간 이상 running 태스크 failed 처리 |
| archive-old-tasks | 매주 일 04:00 UTC | 90일 이상 완료 태스크 삭제 |

## Consequences

### Positive

- 자동화된 태스크 분배로 운영 부담 감소
- 스케줄 기반 자동 태스크 생성
- 오래된 데이터 자동 정리

### Negative

- 스케줄 평가 주기에 따른 지연
- 복잡한 스케줄 조건 디버깅 어려움

## Implementation

```
agent/
├── queue-dispatcher.js    # 태스크 큐 디스패처
└── schedule-evaluator.js  # 스케줄 평가기

app/api/
└── schedules/
    ├── route.ts           # GET, POST
    └── [id]/
        ├── route.ts       # PUT, DELETE
        └── toggle/
            └── route.ts   # PUT (toggle)
```

---

## References

- Commit: `7de80b4` (STEP 12 - task queue dispatcher)
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Phase 4
