# 환경 변수 가이드

이 문서는 DoAi.Me v2.1 프로젝트의 모든 환경 변수를 정의합니다.

---

## 1. 웹 애플리케이션 (Next.js / Vercel)

**파일**: `.env.local` (로컬 개발) | Vercel 대시보드 (배포)

| 변수명 | 필수 | 설명 | 예시 |
|--------|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase 익명 키 (클라이언트용) | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase 서비스 키 (API Routes용, 서버 전용) | `eyJhbGciOiJIUzI1NiIs...` |
| `AUTH0_DOMAIN` | ✅ | Auth0 테넌트 도메인 | `your-tenant.us.auth0.com` |
| `AUTH0_CLIENT_ID` | ✅ | Auth0 애플리케이션 클라이언트 ID | `abc123...` |
| `AUTH0_CLIENT_SECRET` | ✅ | Auth0 애플리케이션 클라이언트 시크릿 (서버 전용) | `def456...` |
| `AUTH0_SECRET` | ✅ | 세션 쿠키 암호화용 랜덤 문자열 (32+ 바이트) | `openssl rand -hex 32` 로 생성 |
| `APP_BASE_URL` | ✅ | 애플리케이션 베이스 URL (콜백/로그아웃 URL 구성용) | `http://localhost:3000` (개발) / `https://doai.me` (배포) |
| `YOUTUBE_API_KEY` | ⚠️ | YouTube Data API v3 키 (채널/영상 등록 시) | `AIza...` |

### 규칙

- `NEXT_PUBLIC_` 접두사: 클라이언트에 노출됨 (브라우저에서 접근 가능)
- `SUPABASE_SERVICE_ROLE_KEY`: **절대** 클라이언트에 노출 금지. API Routes에서만 사용
- `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`: **절대** 클라이언트에 노출 금지. 서버 전용
- `APP_BASE_URL`: 로컬 개발 시 `http://localhost:3000`, Vercel 배포 시 프로덕션 도메인 (`https://doai.me`) 설정 필요
- Auth0 설정 시 Auth0 대시보드에서 다음 URL 등록 필요:
  - **Allowed Callback URLs**: `{APP_BASE_URL}/auth/callback`
  - **Allowed Logout URLs**: `{APP_BASE_URL}`

---

## 2. Node PC Agent (Windows)

**파일**: `agent/.env` 또는 `C:\Users\[user]\farm_agent\.env`

| 변수명 | 필수 | 기본값 | 설명 |
|--------|------|--------|------|
| `WORKER_NAME` | ✅ | - | 워커 호스트명 (고유) | `node-pc-01` |
| `WORKER_ID` | ⚠️ | - | Supabase `workers.id` (UUID). 첫 등록 후 할당 |
| `SUPABASE_URL` | ✅ | - | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | ✅ | - | Supabase 익명 키 |
| `XIAOWEI_WS_URL` | ✅ | `ws://127.0.0.1:22222/` | Xiaowei WebSocket 주소 |
| `SCRIPTS_DIR` | ❌ | - | AutoJS 스크립트 경로 | `C:\Users\user\farm_scripts` |
| `SCREENSHOTS_DIR` | ❌ | - | 스크린샷 저장 경로 | `C:\Users\user\farm_screenshots` |
| `CONFIG_DIR` | ❌ | - | 설정 파일 경로 | `C:\Users\user\farm_config` |
| `HEARTBEAT_INTERVAL` | ❌ | `30000` | Heartbeat 주기 (ms) |
| `TASK_POLL_INTERVAL` | ❌ | `5000` | 태스크 폴링 주기 (ms) |

### Agent 환경 규칙

- Agent는 **Xiaowei와 같은 PC**에서 실행되어야 함 (로컬 WebSocket)
- `WORKER_NAME`은 노드PC별로 고유해야 함 (예: `node-pc-01`, `node-pc-02`)
- `WORKER_ID`는 첫 heartbeat 시 Supabase에서 조회/생성 후 `.env`에 기록

---

## 3. Supabase (대시보드 설정)

Supabase 프로젝트 생성 후:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`
- **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (서버 전용)

---

## 4. 보안 체크리스트

- [ ] `.env`, `.env.local`은 `.gitignore`에 포함
- [ ] `SUPABASE_SERVICE_ROLE_KEY`는 Vercel 환경 변수에만 저장 (클라이언트 빌드 제외)
- [ ] Agent `.env`는 각 노드PC에 수동 배포 (저장소에 커밋 금지)
