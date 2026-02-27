# ADR-006: 인증 시스템 마이그레이션 (Auth0 → Supabase Auth)

**Status**: Accepted
**Date**: 2026-02-20
**Deciders**: exe-blue 팀

---

## Context

기존 Auth0 기반 인증 시스템을 Supabase Auth로 마이그레이션했습니다.

### 마이그레이션 이유
- **비용 절감**: Auth0 무료 플랜 제약 (7,000 MAU)
- **통합 단순화**: Supabase를 이미 DB/Realtime으로 사용 중
- **RLS 연동**: Supabase Auth + Row Level Security 자연스러운 통합
- **운영 복잡도 감소**: 외부 서비스 의존성 제거

## Decision

### 1. 인증 흐름 변경

```
┌─────────────────────────────────────────────────────────────────────┐
│  Before: Auth0                                                       │
│  /login → Auth0 Universal Login → Callback → Session Cookie          │
├─────────────────────────────────────────────────────────────────────┤
│  After: Supabase Auth                                                │
│  /login → Supabase signInWithPassword → Session Cookie               │
│  /auth/callback → exchangeCodeForSession (Magic Link)               │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. 컴포넌트 교체

| Before (Auth0) | After (Supabase) |
|----------------|------------------|
| `@auth0/nextjs-auth0` | `@supabase/ssr` |
| `useUser()` hook | `supabase.auth.getUser()` |
| `/api/auth/[auth0]` | `/auth/callback`, `/auth/logout` |
| `withPageAuthRequired` | `middleware.ts` 세션 검사 |

### 3. Middleware 세션 관리

```typescript
// middleware.ts
export async function middleware(request: NextRequest) {
  const supabase = createMiddlewareClient({ req: request, res: response });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session && request.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 세션 자동 갱신
  await supabase.auth.getUser();
}
```

### 4. API 인증 방식

| 호출자 | 인증 방식 |
|--------|----------|
| Dashboard (브라우저) | Supabase Session Cookie |
| Agent (Node PC) | `x-api-key` 헤더 |

```typescript
// app/api/tasks/route.ts
async function validateAuth(request: NextRequest) {
  // 1. API Key 확인 (Agent)
  const apiKey = request.headers.get('x-api-key');
  if (apiKey === process.env.AGENT_API_KEY) {
    return { user: null, isAgent: true };
  }

  // 2. Session 확인 (Dashboard)
  const supabase = createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    return { user, isAgent: false };
  }

  throw new Error('Unauthorized');
}
```

## Consequences

### Positive
- Auth0 의존성 제거 (비용 절감)
- Supabase 통합으로 단순한 아키텍처
- RLS 정책 적용 용이
- Session 자동 갱신

### Negative
- 기존 Auth0 사용자 재가입 필요
- Magic Link 이메일 템플릿 재설정

### Migration Steps

1. ✅ Supabase Auth 컴포넌트 구현 (LoginButton, LogoutButton)
2. ✅ Middleware 세션 검사 로직
3. ✅ API Routes 인증 로직 교체
4. ✅ Auth0 관련 코드 제거

## Implementation

### 주요 파일

| 파일 | 역할 |
|------|------|
| `app/login/page.tsx` | 로그인 페이지 (email/password) |
| `app/auth/callback/route.ts` | Magic Link 콜백 |
| `app/auth/logout/route.ts` | 로그아웃 처리 |
| `middleware.ts` | 세션 검사 및 갱신 |
| `lib/supabase/server.ts` | Server-side Supabase 클라이언트 |
| `components/auth/` | LoginButton, LogoutButton, Profile |

### 추가 기능

- **Agent Supervisor**: Agent 상태 모니터링
- **Device Watchdog**: 디바이스 연결 감시
- **Stale Task Cleaner**: stuck 태스크 정리

## Related

- **Commits**:
  - `fd79a87` feat: Auth0 login flow, proxy API fix
  - `8db49db` feat: migrate Auth0 to Supabase Auth, add agent supervisor
- **PRs**:
  - #8: Refactor: Simplify Auth0 route handling
