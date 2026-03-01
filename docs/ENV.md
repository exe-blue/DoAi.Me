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
| `YOUTUBE_API_KEY` | ⚠️ | YouTube Data API v3 키 (채널/영상 등록 시) | `AIza...` |

### Supabase Auth (로그인/회원가입)

- 로그인·인증은 Supabase Auth 사용 (이메일/비밀번호, Magic Link 등)
- Supabase Dashboard → Authentication → URL Configuration:
  - Site URL: `http://localhost:3000` (로컬) / `https://doai.me` (프로덕션)
  - Redirect URLs: `http://localhost:3000/auth/callback`, `https://doai.me/auth/callback`

### 규칙

- `NEXT_PUBLIC_` 접두사: 클라이언트에 노출됨 (브라우저에서 접근 가능)
- `SUPABASE_SERVICE_ROLE_KEY`: **절대** 클라이언트에 노출 금지. API Routes에서만 사용

---

## 2. Node PC Agent (Windows / WSL2)

**파일**: `agent/.env` 또는 `C:\Users\[user]\farm_agent\.env` (Windows) / `/home/[user]/farm_agent/.env` (WSL2)

| 변수명 | 필수 | 기본값 | 설명 |
|--------|------|--------|------|
| `SUPABASE_URL` | ✅ | - | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | ✅ | - | Supabase 익명 키 |
| `XIAOWEI_WS_URL` | ✅ | `ws://127.0.0.1:22222/` | Xiaowei WebSocket 주소 |
| `PC_NUMBER` | ❌ | - | **사용 안 함.** PC 번호는 DB에서 자동 등록 후 `agent/data/pc.json`(또는 Electron: `C:\Users\[user]\AppData\Roaming\DoAi Agent\config.json`)에 저장됨 |
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
- **PC 번호**: `.env`에 두지 않음. 첫 실행 시 Supabase RPC `register_new_pc()`로 다음 번호(PC-01, PC-02, …) 할당 후 `agent/data/pc.json`에 저장. 이후 실행 시 해당 파일에서 읽어 사용. Electron 도입 시 동일 플로우를 `electron-store`로 전환 가능 (경로: `C:\Users\[user]\AppData\Roaming\DoAi Agent\config.json`)

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
- [ ] SonarQube/기타 토큰은 **코드·설정 파일에 하드코딩 금지** — 환경 변수만 사용

---

## 5. SonarQube MCP (선택)

Cursor MCP에서 SonarQube를 쓸 때 토큰은 **환경 변수**로만 전달합니다.

| 변수명 | 설명 |
|--------|------|
| `SONARQUBE_TOKEN` | SonarCloud User/Scoped Token (설정 파일에 넣지 말 것) |
| `SONARQUBE_ORG` | 조직 키 (예: `exe-blue`) |
| `SONARQUBE_CLOUD_URL` | `https://sonarcloud.io` |
| `SONARQUBE_IDE_PORT` | IDE 연동 포트 (예: `64120`) |

- `~/.cursor/mcp.json`(또는 워크스페이스 MCP 설정)에서는 `"SONARQUBE_TOKEN": "${SONARQUBE_TOKEN}"`처럼 **참조만** 하고, 실제 값은 OS/Cursor 환경에 설정.
- 노출된 토큰이 있었다면 SonarCloud에서 **즉시 폐기(Revoke)** 후 새 토큰 발급.

---

## 6. Supabase MCP (선택)

Cursor MCP에서 Supabase를 쓸 때 API 토큰은 **환경 변수**로만 전달합니다.

| 변수명 | 설명 |
|--------|------|
| `SUPABASE_MCP_TOKEN` | Supabase MCP용 Personal Access Token (설정 파일에 넣지 말 것) |

- `.cursor/mcp.json`에서는 `"Authorization": "Bearer ${SUPABASE_MCP_TOKEN}"`처럼 **참조만** 하고, 실제 값은 OS/Cursor 환경에 설정.
- 노출된 토큰이 있었다면 Supabase Dashboard → Account → Access Tokens에서 **즉시 폐기(Revoke)** 후 새 토큰 발급.
