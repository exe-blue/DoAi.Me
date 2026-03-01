# 환경변수 관리 가이드

## 원칙

- **환경변수(.env)**: 배포 환경(개발/스테이징/운영)에 따라 달라지는 값, 또는 **외부 서비스 연결에 필요한 URL·API 키**만 둡니다. 비밀키는 코드·저장소에 포함하지 않습니다.
- **설정값(동작 파라미터)**: 모든 PC에 공통으로 적용되는 값은 **DB `settings` 테이블**에서 관리하고, Agent는 기동 시·Realtime 구독으로 읽습니다. PC별로 다른 값은 (현재는 env 또는 추후 `pc_config` 등) 별도 체계로 관리합니다.
- **PC 번호**: `.env`에 두지 않습니다. 첫 실행 시 Supabase RPC `register_new_pc()`로 할당 후 `agent/data/pc.json`(또는 Electron 시 electron-store)에 저장해 재사용합니다.

---

## 환경변수 목록

### 대시보드 (Next.js / Vercel)

| 키 | 설명 | 예시 값 | 민감도 | 관리 위치 |
|----|------|---------|--------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxx.supabase.co` | 중 | .env.local / Vercel Env |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 익명 키 (클라이언트) | `eyJ...` | 중 | .env.local / Vercel Env |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 (API 전용) | `eyJ...` | 높음 | .env.local / Vercel Env (서버만) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 키 | `AIza...` | 높음 | .env.local / Vercel Env |
| `API_KEY` | 대시보드/스크립트 API 인증 (선택) | (문자열) | 높음 | .env.local |
| `CRON_SECRET` | 크론 API 호출 Bearer 토큰 | (문자열) | 높음 | .env.local / Vercel Env |
| `NEXT_PUBLIC_APP_URL` | 앱 기준 URL (SSR/리다이렉트) | `http://localhost:3000` | 낮음 | .env.local |
| `NEXT_PUBLIC_BUILD_ID` | 빌드 식별 (next.config) | `1` | 낮음 | 확인 필요 |
| `SENTRY_DSN` | Sentry DSN | `https://...@sentry.io/...` | 중 | .env / Vercel |
| `SENTRY_AUTH_TOKEN` | Sentry 빌드 업로드 토큰 | (문자열) | 높음 | .env / Vercel |
| `SENTRY_RELEASE` | Sentry 릴리스 버전 | (문자열) | 낮음 | 확인 필요 |
| `NODE_ENV` | 실행 환경 | `development` / `production` | 낮음 | 시스템/빌드 |
| `CI` | CI 환경 여부 (Sentry silent) | `true` | 낮음 | CI |
| `NEXT_RUNTIME` | Next.js 런타임 (instrumentation) | `nodejs` / `edge` | 낮음 | Next.js |

### Agent (Node.js / Windows·WSL2)

| 키 | 설명 | 예시 값 | 민감도 | 관리 위치 |
|----|------|---------|--------|------------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | `https://xxx.supabase.co` | 중 | agent/.env |
| `SUPABASE_ANON_KEY` | Supabase 익명 키 | `eyJ...` | 중 | agent/.env |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 | `eyJ...` | 높음 | agent/.env |
| `XIAOWEI_WS_URL` | Xiaowei WebSocket 주소 | `ws://127.0.0.1:22222/` | 낮음 | agent/.env |
| `SCRIPTS_DIR` | AutoJS 스크립트 경로 | `/mnt/c/Users/user/farm_scripts` | 낮음 | agent/.env |
| `SCREENSHOTS_DIR` | 스크린샷 저장 경로 | (경로) | 낮음 | agent/.env |
| `CONFIG_DIR` | 설정 파일 경로 | (경로) | 낮음 | agent/.env |
| `XIAOWEI_TOOLS_DIR` | Xiaowei tools 경로 | `/mnt/c/Program Files (x86)/xiaowei/tools` | 낮음 | agent/.env |
| `LOGGING_DIR` | 시청 완료 스크린샷 저장 경로 | `c:\logging` | 낮음 | agent/.env |
| `RUN_OPTIMIZE_ON_CONNECT` | 연결 직후 optimize 실행 | `1` / `true` | 낮음 | agent/.env |
| `OPENAI_API_KEY` | OpenAI API 키 (댓글 생성) | `sk-...` | 높음 | agent/.env |
| `OPENAI_MODEL` | OpenAI 모델명 | `gpt-4o-mini` | 낮음 | agent/.env |
| `PC_NUMBER` | (선택) 테스트용 PC 번호 오버라이드. 운영에서는 사용 안 함 | `PC-01` | 낮음 | agent/.env |
| `HEARTBEAT_INTERVAL` | Heartbeat 주기(ms). DB settings로 오버라이드 가능 | `30000` | 낮음 | agent/.env |
| `TASK_POLL_INTERVAL` | 태스크 폴링 주기(ms) | `5000` | 낮음 | agent/.env |
| `MAX_CONCURRENT_TASKS` | PC당 최대 동시 태스크. DB settings로 오버라이드 가능 | `20` | 낮음 | agent/.env |
| `TASK_EXECUTION_TIMEOUT_MS` | 태스크 실행 타임아웃(ms) | `300000` | 낮음 | agent/.env |
| `IS_PRIMARY_PC` | Primary PC 여부 (현재 env만 사용) | `true` / `1` | 낮음 | agent/.env |
| `DEBUG_ORCHESTRATOR` | 오케스트레이터 디버그 로그 | `1` | 낮음 | agent/.env |
| `DEBUG_ORCHESTRATOR_CLAIM` | claim 상세 로그 | `1` | 낮음 | agent/.env |
| `AGENT_VERSION` | Agent 버전 표시 | `0.1.0-alpha` | 낮음 | agent/.env |

### 클라이언트 앱 (Electron) — 예정

| 키 | 설명 | 예시 값 | 민감도 | 주의사항 |
|----|------|---------|--------|----------|
| (Electron 패키징 시) | Supabase URL/키는 런타임에 주입하거나 설정 화면에서 입력 권장 | - | 높음 | 빌드에 API 키 박지 말 것 |

---

## .env.example 템플릿

### 루트 (Next.js)

```bash
# .env.example (웹 앱)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
YOUTUBE_API_KEY=AIza...
# SUPABASE_ACCESS_TOKEN=sbp_...   # CLI/MCP 선택
```

### agent/ (Node PC Agent)

```bash
# agent/.env.example
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
XIAOWEI_WS_URL=ws://127.0.0.1:22222/
SCRIPTS_DIR=/mnt/c/Users/user/farm_scripts
SCREENSHOTS_DIR=/mnt/c/Users/user/farm_screenshots
CONFIG_DIR=/mnt/c/Users/user/farm_config
XIAOWEI_TOOLS_DIR=/mnt/c/Program Files (x86)/xiaowei/tools
# LOGGING_DIR=c:\logging
# RUN_OPTIMIZE_ON_CONNECT=1
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
# HEARTBEAT_INTERVAL=30000
# TASK_POLL_INTERVAL=5000
# MAX_CONCURRENT_TASKS=20
# PC_NUMBER=PC-01  # 테스트용만, 운영은 DB 자동 등록
```

---

## 주의사항

- **Electron 앱에 넣으면 안 되는 키**: `SUPABASE_SERVICE_ROLE_KEY`, `YOUTUBE_API_KEY`, `OPENAI_API_KEY`, `API_KEY`, `CRON_SECRET`, `SENTRY_AUTH_TOKEN`, 기타 비밀키. 클라이언트에는 익명 키·공개 URL만 사용하거나, 사용자 입력/설정으로 주입.
- **git에 올리면 안 되는 것**: `.env`, `.env.local`, `.env.prod`, `agent/.env`, `agent/data/pc.json`, 실제 토큰·비밀번호가 들어간 모든 파일.
- **Agent `.env`**: 각 노드 PC에 수동 배포, 저장소에 커밋 금지.
