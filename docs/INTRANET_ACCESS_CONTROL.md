# V. 인트라넷 접근 제어 (알파)

퍼블릭처럼 복잡한 권한 체계는 두지 않음. **최소한의 보호만** 적용.

---

## 접근 가능한 사람

- **본인 계정**: 이메일 + 비밀번호
- **내부 테스터 1~2명**: 수동 계정 생성 (Supabase Dashboard → Authentication → Users)

---

## 보호 방식

| 항목 | 방식 |
|------|------|
| **로그인** | Supabase Auth 이메일/비밀번호. (Google OAuth는 퍼블릭 때 추가) |
| **페이지** | `middleware.ts`에서 미인증 사용자 → `/login` 리다이렉트 |
| **API** | 대시보드/브라우저: Supabase Session(쿠키) 필수. **Agent 전용**: `x-api-key` 헤더로 인증 |
| **API Key** | Vercel 환경변수 `API_KEY`로 관리. Agent는 동일 값을 `.env` 등에 두고 `x-api-key`로 전송 |

---

## 알파에서 하지 않는 것

- **역할(Role) 분리**: admin / operator / viewer 미구현
- **RLS 세분화**: 단일 유저 전제로 테이블별 RLS 세분화 생략
- **2FA**: 미적용
- **IP 제한**: Vercel에서 구현 복잡하므로 미적용

---

## 구현 요약

- **middleware.ts**: 공개 경로(`/`, `/login`, `/auth`, `/api/health` 등) 제외 시 `getUser()`로 세션 확인. 없으면 API는 `x-api-key` 검사 후 통과/401, 페이지는 `/login?returnTo=...` 리다이렉트.
- **API Routes**: 서버에서 `createSupabaseServerClient()`(service role) 사용. 호출 자체는 middleware에서 세션 또는 `x-api-key`로 이미 차단/허용됨.
- **Agent**: Supabase 직접 사용 + 필요 시 API 호출 시 `x-api-key` 헤더에 `API_KEY` 설정.
