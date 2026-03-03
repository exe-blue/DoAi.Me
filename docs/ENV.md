# 환경 변수 가이드

이 문서는 DoAi.Me v2.1 프로젝트의 환경 변수와 주입 위치를 정의합니다.

---

## 1. 웹 애플리케이션 (Next.js / Vercel)

**기본 템플릿 파일**: `apps/web/.env.example`  
**로컬 개발 파일**: `apps/web/.env.local` (Git 커밋 금지)  
**배포 주입 위치**: Vercel Project Settings → Environment Variables

### 1-1. 변수 분류 (필수/선택 + 공개/비공개)

| 변수명 | 필수 | 공개 범위 | 설명 | 주입 위치 |
|--------|------|-----------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Public (`NEXT_PUBLIC_*`) | Supabase 프로젝트 URL | Local `.env.local`, Vercel (Development/Preview/Production) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public (`NEXT_PUBLIC_*`) | Supabase 익명 키 (클라이언트 사용) | Local `.env.local`, Vercel (Development/Preview/Production) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only | API Routes/Server Actions용 관리자 키 | Local `.env.local`, Vercel (Development/Preview/Production) |
| `YOUTUBE_API_KEY` | 선택 | Server-only | YouTube Data API 호출(채널/영상 동기화) | Local `.env.local`, Vercel (필요 환경만) |

### 1-2. 환경별 주입 매트릭스

| 환경 | 값 소스 | 실제 주입 위치 |
|------|---------|----------------|
| Local | 개발자 개인 키 | `apps/web/.env.local` |
| Preview | 스테이징/검증용 키 | Vercel `Preview` Environment Variables |
| Production | 운영 키 | Vercel `Production` Environment Variables |

> `NEXT_PUBLIC_*`는 빌드 결과에 포함되어 브라우저에서 확인 가능하므로 비밀값을 넣으면 안 됩니다.

### 1-3. `NEXT_PUBLIC_*` vs 서버 전용 키 경계

- `NEXT_PUBLIC_*` 접두사: **클라이언트 노출 허용 값만** 사용
- `SUPABASE_SERVICE_ROLE_KEY`: **절대 클라이언트 전달 금지**
  - 사용 위치: `app/api/*`, Server Actions, 서버 전용 라이브러리
  - 금지 위치: React Client Component, 브라우저 번들, `NEXT_PUBLIC_` 접두사 변수

### 1-4. Supabase 쪽 시크릿 관리

- Supabase Dashboard → Project Settings → API
  - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`
- Supabase Edge Functions를 사용하는 경우에는 Supabase Dashboard의 **Edge Function Secrets**에 별도 저장하고, 웹앱(Vercel) 변수와 분리 관리합니다.

### 1-5. 키 노출 사고 대응 (필수)

- 저장소/채팅/로그에 키가 노출되었으면 즉시 아래 순서로 처리:
  1. Supabase/Google 콘솔에서 해당 키 **폐기(rotate/revoke)**
  2. 새 키 재발급
  3. Vercel(Local 포함) 값 교체
  4. 재배포 및 동작 점검

---

## 2. Node PC Agent (Windows / WSL2)

**파일**: `agent/.env` 또는 `C:\Users\[user]\farm_agent\.env` (Windows) / `/home/[user]/farm_agent/.env` (WSL2)

| 변수명 | 필수 | 기본값 | 설명 |
|--------|------|--------|------|
| `WORKER_NAME` | ✅ | - | 워커 호스트명 (고유) | `node-pc-01` |
| `WORKER_ID` | ⚠️ | - | Supabase `workers.id` (UUID). 첫 등록 후 할당 |
| `SUPABASE_URL` | ✅ | - | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | ✅ | - | Supabase 익명 키 |
| `XIAOWEI_WS_URL` | ✅ | `ws://127.0.0.1:22222/` | Xiaowei WebSocket 주소 |
| `SCRIPTS_DIR` | ❌ | - | AutoJS 스크립트 경로 (Windows: `C:\Users\user\farm_scripts` / WSL2: `/mnt/c/Users/user/farm_scripts`) |
| `SCREENSHOTS_DIR` | ❌ | - | 스크린샷 저장 경로 (Windows: `C:\Users\user\farm_screenshots` / WSL2: `/mnt/c/Users/user/farm_screenshots`) |
| `CONFIG_DIR` | ❌ | - | 설정 파일 경로 (Windows: `C:\Users\user\farm_config` / WSL2: `/mnt/c/Users/user/farm_config`) |
| `XIAOWEI_TOOLS_DIR` | ❌ | - | Xiaowei tools 경로 (WSL2: `/mnt/c/Program Files (x86)/xiaowei/tools`) |
| `HEARTBEAT_INTERVAL` | ❌ | `30000` | Heartbeat 주기 (ms) |
| `TASK_POLL_INTERVAL` | ❌ | `5000` | 태스크 폴링 주기 (ms) |

### Windows vs WSL2 경로 비교

| 용도 | Windows 경로 | WSL2 Ubuntu 경로 |
|------|-------------|-----------------|
| 스크립트 디렉토리 | `C:\Users\user\farm_scripts` | `/mnt/c/Users/user/farm_scripts` |
| 스크린샷 디렉토리 | `C:\Users\user\farm_screenshots` | `/mnt/c/Users/user/farm_screenshots` |
| 설정 디렉토리 | `C:\Users\user\farm_config` | `/mnt/c/Users/user/farm_config` |
| Xiaowei tools | `C:\Program Files (x86)\xiaowei\tools` | `/mnt/c/Program Files (x86)/xiaowei/tools` |
| D드라이브 스크립트 | `D:\farm_scripts\youtube_watch.js` | `/mnt/d/farm_scripts/youtube_watch.js` |

> **WSL2 규칙**: Windows 드라이브 문자(C:, D:)는 `/mnt/c/`, `/mnt/d/`로 대체. 백슬래시(`\`)는 슬래시(`/`)로 대체.

### Agent 환경 규칙

- Agent는 **Xiaowei와 같은 PC**에서 실행되어야 함 (로컬 WebSocket)
- `WORKER_NAME`은 노드PC별로 고유해야 함 (예: `node-pc-01`, `node-pc-02`)
- `WORKER_ID`는 첫 heartbeat 시 Supabase에서 조회/생성 후 `.env`에 기록

---

## 3. 보안 체크리스트

- [ ] `.env`, `.env.local`은 `.gitignore`에 포함
- [ ] `SUPABASE_SERVICE_ROLE_KEY`는 서버 환경 변수에만 저장
- [ ] Agent `.env`는 각 노드PC에 수동 배포 (저장소에 커밋 금지)
