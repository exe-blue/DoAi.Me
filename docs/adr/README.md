# Architecture Decision Records (ADRs)

DoAi.Me 프로젝트의 아키텍처 결정 기록입니다. 각 ADR은 PR 단위의 변경 결정사항을 문서화합니다.

## ADR 목록

| ADR | 제목 | 상태 | 날짜 |
|-----|------|------|------|
| [ADR-001](./ADR-001-foundation-architecture.md) | 기초 아키텍처 및 v2.1 설계 | ✅ Accepted | 2026-02-12 |
| [ADR-002](./ADR-002-device-discovery-pipeline.md) | 디바이스 디스커버리 파이프라인 | ✅ Accepted | 2026-02-13 |
| [ADR-003](./ADR-003-youtube-watch-task-pipeline.md) | YouTube 시청 태스크 파이프라인 | ✅ Accepted | 2026-02-13 |
| [ADR-004](./ADR-004-realtime-monitoring-stabilization.md) | 실시간 모니터링 및 안정화 | ✅ Accepted | 2026-02-14 |
| [ADR-005](./ADR-005-channel-content-management.md) | 채널/콘텐츠 관리 시스템 (Step 11) | ✅ Accepted | 2026-02-18 |
| [ADR-006](./ADR-006-auth-migration-supabase.md) | 인증 시스템 마이그레이션 (Auth0 → Supabase) | ✅ Accepted | 2026-02-20 |
| [ADR-007](./ADR-007-task-queue-dispatcher.md) | Task Queue Dispatcher & Schedule Evaluator | ✅ Accepted | 2026-02-22 |

## ADR 형식

각 ADR은 다음 구조를 따릅니다:

- **Status**: Proposed / Accepted / Deprecated / Superseded
- **Context**: 결정이 필요했던 배경
- **Decision**: 내린 결정과 근거
- **Consequences**: 결정의 결과 (장단점)
- **Implementation**: 구현된 주요 파일/변경사항
- **Related**: 관련 커밋/PR/이슈
