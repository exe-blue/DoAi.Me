# ADR-003: Real-time Dashboard with Supabase Broadcast

**Status**: Accepted
**Date**: 2026-02-14
**Deciders**: Development Team
**Related Commits**: `3680255`, `a4b5c04`, `df87122`

---

## Context

500대의 Galaxy S9 디바이스와 다수의 태스크를 모니터링하기 위해서는 실시간 UI 업데이트가 필수입니다. 기존의 폴링 방식은 다음 문제점이 있었습니다:

1. 서버 부하 증가
2. 실시간성 부족 (폴링 간격만큼 지연)
3. 불필요한 API 호출

## Decision

### Supabase Broadcast 기반 실시간 아키텍처

```
┌─────────────────────────────────────────────────────┐
│  Database Trigger (INSERT/UPDATE/DELETE)            │
│           ↓                                         │
│  pg_net HTTP → Supabase Realtime Broadcast API     │
│           ↓                                         │
│  WebSocket → Dashboard (React + Zustand)           │
└─────────────────────────────────────────────────────┘
```

### Broadcast 토픽 구조

| 토픽 | 용도 |
|------|------|
| `room:dashboard` | 전체 통계 |
| `room:workers` | 워커 목록 변경 |
| `room:worker:<id>` | 개별 워커 상태 |
| `room:devices` | 500대 디바이스 그리드 |
| `room:tasks` | 태스크 목록 변경 |
| `room:task:<id>:logs` | 개별 태스크 로그 스트림 |
| `room:task_logs` | 전체 로그 모니터링 |
| `room:system` | 시스템 알림 |

### 주요 Hooks

```typescript
// hooks/use-realtime.ts
useTasksBroadcast()        // room:tasks 구독
useTaskLogsBroadcast()     // room:task:<id>:logs 구독
useAllTaskLogsBroadcast()  // room:task_logs 구독
useDevicesBroadcast()      // room:devices 구독
useBroadcast()             // 범용 Broadcast 구독
```

### 실시간 로그 뷰어

- 필터링: level (info/warn/error), task_id, 검색어
- 자동 스크롤: 새 로그 도착 시 자동 스크롤
- 일시 정지: 스크롤 중 자동 스크롤 일시 정지

### 디바이스 그리드

- 500대 디바이스를 그리드로 표시
- 상태별 색상 구분 (online/offline/busy/error)
- 실시간 상태 업데이트

## Consequences

### Positive

- 진정한 실시간 모니터링 (수 ms 지연)
- 서버 부하 감소 (불필요한 폴링 제거)
- 사용자 경험 향상

### Negative

- WebSocket 연결 관리 필요
- Supabase Realtime 제한 (동시 연결 수)

## Implementation

- `hooks/use-realtime.ts`
- `hooks/use-logs-store.ts`
- `components/logs-page.tsx`
- `components/devices-page.tsx`
- `supabase/migrations/00003_realtime_broadcast.sql`

---

## References

- Commits: `3680255` (monitoring dashboard), `a4b5c04` (log viewer), `df87122` (device broadcast)
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Phase 5
