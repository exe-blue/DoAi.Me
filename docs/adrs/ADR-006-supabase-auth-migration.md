# ADR-006: Auth0 to Supabase Auth Migration

**Status**: Accepted
**Date**: 2026-02-20
**Deciders**: Development Team
**Related Commits**: `8db49db`, `fd79a87`, `b3e0edf`

---

## Context

초기 구현에서 Auth0를 인증 솔루션으로 사용했으나, 다음과 같은 이유로 Supabase Auth로 마이그레이션을 결정했습니다:

1. **통합성**: 이미 Supabase를 데이터베이스로 사용 중, 인증도 통합하면 관리 단순화
2. **비용**: Auth0 무료 티어 제한 vs Supabase 통합 요금제
3. **RLS 연동**: Supabase RLS(Row Level Security)와 자연스러운 통합

## Decision

### 1. 인증 방식 변경

| 항목 | Auth0 | Supabase Auth |
|------|-------|---------------|
| 로그인 | Auth0 Universal Login | Supabase `signInWithPassword` |
| 세션 | Auth0 세션 | Supabase 세션 (JWT) |
| 미들웨어 | Auth0 middleware | Supabase middleware |
| 콜백 | `/auth/callback` (Auth0) | `/auth/callback` (Supabase) |

### 2. 구현 변경 사항

```typescript
// 이전: Auth0
import { getSession } from '@auth0/nextjs-auth0';

// 이후: Supabase Auth
import { createAuthServerClient } from '@/lib/supabase/server';

export async function middleware(req: NextRequest) {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
}
```

### 3. 추가 모듈 (Agent)

#### Agent Supervisor

```
agent/supervisor.js
- Agent 프로세스 상태 모니터링
- 비정상 종료 시 자동 재시작
- 헬스체크 실패 시 알림
```

#### Device Watchdog

```
agent/device-watchdog.js
- 디바이스 연결 상태 모니터링
- 연결 끊김 감지 시 재연결 시도
- 오프라인 디바이스 상태 업데이트
```

#### Stale Task Cleaner

```
agent/stale-task-cleaner.js
- 오래된 running 상태 태스크 감지
- 1시간 이상 running → failed 처리
```

### 4. 마이그레이션 스키마

```sql
-- app_users 테이블 (Supabase auth.users 확장)
CREATE TABLE app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Consequences

### Positive

- 인증과 데이터베이스 통합으로 관리 단순화
- Supabase RLS와 자연스러운 연동
- 비용 절감

### Negative

- 기존 Auth0 사용자 마이그레이션 필요
- 일부 Auth0 전용 기능 사용 불가

## Implementation

### 파일 변경

```
app/
├── login/
│   └── page.tsx              # Supabase 로그인 폼
├── auth/
│   └── callback/
│       └── route.ts          # Supabase 콜백 처리
└── api/
    └── auth/
        └── logout/
            └── route.ts      # Supabase 로그아웃

lib/supabase/
├── server.ts                 # createAuthServerClient
└── client.ts                 # createAuthBrowserClient

components/
├── LoginButton.tsx           # Supabase 로그인 버튼
├── LogoutButton.tsx          # Supabase 로그아웃 버튼
└── Profile.tsx               # 사용자 프로필

agent/
├── supervisor.js             # Agent 감독자
├── device-watchdog.js        # 디바이스 감시자
└── stale-task-cleaner.js     # 오래된 태스크 정리
```

---

## References

- Commits: `8db49db` (Supabase Auth migration), `fd79a87` (Auth0 initial), `b3e0edf` (route handling)
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Section 3.2
