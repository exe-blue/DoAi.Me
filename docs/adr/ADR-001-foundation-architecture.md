# ADR-001: 기초 아키텍처 및 v2.1 설계

**Status**: Accepted
**Date**: 2026-02-12
**Deciders**: exe-blue 팀

---

## Context

기존 v1 아키텍처(FastAPI + Celery + Redis)는 다음 문제점이 있었습니다:
- 상시 운영 서버 비용
- Celery Worker의 복잡한 설정
- uiautomator2 기반 불안정한 디바이스 제어

500대 Galaxy S9 디바이스를 5대의 Node PC로 관제하는 YouTube 자동 시청 파밍 시스템을 위해 새로운 아키텍처가 필요했습니다.

## Decision

### 1. Serverless 아키텍처 채택

| 항목 | v1 (폐기) | v2.1 (채택) |
|------|-----------|-------------|
| 백엔드 | FastAPI (자체 서버) | Vercel API Routes (Serverless) |
| 태스크 큐 | Celery + Redis | Supabase Realtime + Xiaowei |
| 디바이스 제어 | uiautomator2 (Python) | Xiaowei WebSocket API + AutoJS |
| 인프라 비용 | VPS 상시 운영 | Serverless (사용량 기반) |

### 2. 핵심 기술 스택

- **Web Dashboard**: Next.js 14 (App Router), React 18, Tailwind, shadcn/ui, Zustand
- **Agent**: Node.js, Xiaowei WebSocket (`ws://127.0.0.1:22222/`)
- **Database**: Supabase PostgreSQL + Realtime + Broadcast
- **Deployment**: Vercel (Dashboard), Windows PC (Agent)

### 3. 설계 원칙

1. **서버 없는 아키텍처**: Supabase + Vercel만으로 운영
2. **Xiaowei 최대 활용**: 31개 API로 디바이스 제어, Action 녹화/재생
3. **프리셋 기반 실행**: 반복 작업은 Xiaowei Action으로 녹화 후 API 호출
4. **DB 중심 로깅**: 모든 명령/결과를 Supabase에 기록

## Consequences

### Positive
- 인프라 비용 절감 (상시 서버 불필요)
- Xiaowei의 안정적인 디바이스 제어
- Supabase Realtime으로 실시간 상태 동기화
- Next.js App Router의 간결한 API 라우트

### Negative
- Vercel Serverless 함수의 실행 시간 제한 (10초~60초)
- Xiaowei 종속성 (Windows 전용)
- Supabase 무료 플랜 제약 (DB 500MB, Realtime 동시 연결 수)

### Risks
- Xiaowei 서비스 중단 시 대안 필요
- Supabase 장애 시 전체 시스템 영향

## Implementation

### 주요 파일/디렉토리

```
doai.me/
├── app/                    # Next.js App Router
│   ├── api/                # API Routes (19개)
│   └── page.tsx            # 메인 페이지
├── agent/                  # Node PC Agent
│   ├── agent.js            # 메인 오케스트레이터
│   ├── xiaowei-client.js   # WebSocket 클라이언트
│   └── supabase-sync.js    # Realtime 구독
├── hooks/                  # Zustand Stores
├── lib/                    # 데이터 레이어
│   └── supabase/           # Supabase 클라이언트
└── supabase/
    └── migrations/         # DB 스키마
```

### 핵심 테이블

- `workers`: Node PC 워커 (5대)
- `devices`: Galaxy S9 디바이스 (500대)
- `tasks`: 작업 큐
- `task_logs`: 실행 로그
- `presets`: Xiaowei 프리셋

## Related

- **Commits**:
  - `4ac9370` chore: v2.1 기초 구축 - Next.js, Agent, Supabase 스키마
  - `229a583` chore: Next.js 개발 환경 캐시 관리 개선
- **Documents**:
  - `ARCHITECTURE.md`: 상세 아키텍처 문서
  - `docs/IMPLEMENTATION_PLAN.md`: 구현 계획서
