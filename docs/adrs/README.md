# Architecture Decision Records (ADRs)

DoAi.Me 프로젝트의 주요 아키텍처 결정 사항을 기록합니다.

---

## ADR 목록

| ADR | 제목 | 상태 | 날짜 |
|-----|------|------|------|
| [ADR-001](./ADR-001-v2.1-serverless-architecture.md) | v2.1 Serverless Architecture Migration | Accepted | 2026-02-12 |
| [ADR-002](./ADR-002-channel-video-management.md) | Channel/Video Management System | Accepted | 2026-02-13 |
| [ADR-003](./ADR-003-realtime-dashboard.md) | Real-time Dashboard with Supabase Broadcast | Accepted | 2026-02-14 |
| [ADR-004](./ADR-004-agent-parallel-execution.md) | Agent Parallel Execution Engine | Accepted | 2026-02-14 |
| [ADR-005](./ADR-005-task-queue-schedule.md) | Task Queue & Schedule System | Accepted | 2026-02-16 |
| [ADR-006](./ADR-006-supabase-auth-migration.md) | Auth0 to Supabase Auth Migration | Accepted | 2026-02-20 |

---

## 프로젝트 현황 요약

### 완료된 기능

- **v2.1 아키텍처**: FastAPI → Vercel API Routes, Celery → Supabase Realtime
- **채널/영상 관리**: YouTube Data API v3 연동, 채널 등록 및 모니터링
- **실시간 대시보드**: Supabase Broadcast 기반 실시간 UI
- **병렬 실행 엔진**: 청크 기반 500대 디바이스 병렬 처리
- **태스크 큐 시스템**: Queue Dispatcher, Schedule Evaluator
- **인증 시스템**: Supabase Auth 통합

### 기술 스택

| 카테고리 | 기술 |
|----------|------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind, shadcn/ui, Zustand |
| Backend | Vercel API Routes (Serverless) |
| Database | Supabase PostgreSQL |
| Realtime | Supabase Broadcast (pg_net + WebSocket) |
| Agent | Node.js, TypeScript, Xiaowei WebSocket |
| Device | Xiaowei (효위투핑), AutoJS |

### 시스템 규모

- **500대** Galaxy S9 디바이스
- **5대** Node PC (각 100대 관리)
- **19개** API Routes
- **10개** Database Tables

---

## ADR 작성 가이드

새로운 아키텍처 결정 시 다음 템플릿을 사용하세요:

```markdown
# ADR-XXX: [제목]

**Status**: Proposed | Accepted | Deprecated | Superseded
**Date**: YYYY-MM-DD
**Deciders**: [결정자]
**Related Commits**: [관련 커밋 해시]

---

## Context

[결정이 필요한 배경 설명]

## Decision

[결정 내용 상세]

## Consequences

### Positive
- [긍정적 결과]

### Negative
- [부정적 결과]

## Implementation

[구현 상세]

---

## References

- [관련 문서 링크]
```
