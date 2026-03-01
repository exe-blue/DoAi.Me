# 스테이징 배포 순서 및 환경변수 우선순위

deploy-server-expert 관점에서 정리한 스테이징 배포 절차와 env 우선순위입니다.  
팀이 DB 스키마/오류 없이 진행할 수 있도록 단일 진실(SSOT)과 의존성을 명시합니다.

---

## 1. 스테이징 배포 순서 (의존성 순)

아래 순서를 지키면 스테이징에서 DB·앱·헬스체크가 안정적으로 동작합니다.

| 순서 | 단계 | 담당/위치 | 설명 |
|------|------|-----------|------|
| **0** | **Supabase 프로젝트** | Supabase Dashboard | 스테이징용 프로젝트 또는 프로덕션과 동일 프로젝트 사용. DB가 없으면 앱/에이전트 모두 실패. |
| **1** | **DB 마이그레이션** | `supabase/migrations/` | `MIGRATION_ORDER.md` 순서대로 적용. **task_devices**·트리거·RPC(`claim_task_devices_for_pc` 등)가 있어야 에이전트가 작업을 claim 가능. |
| **2** | **스테이징 서버 준비** | 스테이징 호스트 | Docker·Docker Compose 설치, `/app` 디렉터리, SSH 배포 키 등록. |
| **3** | **환경변수 파일** | 스테이징 서버 `/app` | `.env.staging` 생성(아래 2절 우선순위 참고). **배포 전** 반드시 존재해야 함. |
| **4** | **GitHub Secrets** | GitHub repo Settings | `STAGING_DEPLOY_KEY`, `STAGING_DEPLOY_HOST`, `STAGING_DEPLOY_USER`, `STAGING_URL`. 옵션: 앱용 시크릿을 GitHub Env에 두고 CI에서 전달할 수도 있음. |
| **5** | **CI: 빌드·푸시** | GitHub Actions | `develop` 푸시 → lint, test → build-image → security-scan. 이미지: `ghcr.io/<repo>:<sha>`. |
| **6** | **CI: 스테이징 배포** | GitHub Actions | `deploy-staging` job: 서버에서 `docker pull` → `docker-compose -f docker-compose.staging.yml up -d`. |
| **7** | **헬스체크** | GitHub Actions | `STAGING_URL/api/health` 30회 재시도(10초 간격). 실패 시 워크플로 실패. |
| **8** | **에이전트(선택)** | 각 노드 PC | 스테이징 DB를 바라보는 에이전트는 `agent/.env`에 **동일 Supabase** URL/키 설정. task_devices SSOT 유지. |

### 1.1 트리거와 SSOT (task_devices)

- **tasks** INSERT → 트리거 `fn_create_task_devices_on_task_insert` → **task_devices** 행 생성(PC별 1개, 비바쁜 PC만).
- 이후 에이전트는 `claim_task_devices_for_pc` 등 RPC로만 task_devices를 claim/완료/실패 처리.
- 따라서 **배포 순서 1(마이그레이션)** 이 올바르게 적용되어 있어야 스테이징에서도 task_devices 기반 플로우가 동작합니다.

---

## 2. 스테이징 환경변수 우선순위

### 2.1 적용 범위

- **웹 앱(Next.js) 스테이징**: `docker-compose.staging.yml`의 `app` 서비스만 해당.
- **에이전트**: 스테이징과 무관하게 각 PC의 `agent/.env` (override 우선). 스테이징 DB를 쓸 때만 해당 `.env`에 스테이징용 Supabase 값을 넣음.

### 2.2 docker-compose.staging.yml 기준 (컨테이너 내부)

`app` 서비스에는 다음 두 소스가 동시에 적용됩니다.

1. **`env_file: .env.staging`**  
   - 파일 내용이 컨테이너 환경에 먼저 주입됨.
2. **`environment:` 블록**  
   - 블록에 적힌 값이 **그 위를 덮어씀**.
   - 여기서 `NODE_ENV=staging`, `SENTRY_ENVIRONMENT=staging` 같은 **리터럴**은 항상 적용.
   - `NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}` 같은 **변수 치환**은 **호스트(서버) 환경**에서 읽음.  
     → 호스트에 해당 변수가 없으면 **빈 문자열로 덮어써** `.env.staging` 값이 무효화될 수 있음.

**실제 우선순위 (컨테이너 기준):**

1. **가장 낮음**: `env_file: .env.staging` 로 들어온 값  
2. **그 위**: `environment:` 블록의 **리터럴** (NODE_ENV, SENTRY_ENVIRONMENT)  
3. **가장 높음**: `environment:` 블록의 **${VAR}** → 호스트 환경(또는 Compose가 로드하는 프로젝트 루트 `.env`)에서 치환된 값  

### 2.3 권장: 스테이징 서버에서 한 소스만 사용

- **권장**: 스테이징 서버 `/app` 에 **`.env.staging` 하나만** 두고, **`environment:` 블록에서 `${VAR}` 제거**하거나, 호스트에서 해당 변수를 export 하지 않음.  
  → 그러면 `env_file` 값만 적용되어 예측 가능.
- **또는**: 서버에서 `docker-compose` 실행 전에 `set -a; source /app/.env.staging; set +a` 등으로 `.env.staging`을 호스트 환경에 올린 뒤 `docker-compose up` 하면, `${VAR}` 치환이 `.env.staging`과 동일해짐.

정리하면:

- **팀 진행 시**: “스테이징 앱 env는 **서버의 `.env.staging` 한 파일**이 진실”로 두고,  
  - Compose의 `environment`에는 리터럴만 두거나  
  - `${VAR}`를 쓰면 “반드시 서버에서 해당 변수가 채워지도록” 하면 DB/스키마 오류 가능성을 줄일 수 있습니다.

### 2.4 스테이징 웹 앱 필수 변수 (참고)

| 변수 | 필수 | 비고 |
|------|------|------|
| `NODE_ENV` | ✓ | `staging` (Compose에서 리터럴로 설정 가능) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | API Routes용, 클라이언트 노출 금지 |
| `YOUTUBE_API_KEY` | 권장 | 채널/영상 연동 시 |
| `SENTRY_ENVIRONMENT` | ✓ | `staging` (리터럴 권장) |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | 선택 | 에러 추적용 |

템플릿: `.env.staging.example` 참고.

---

## 3. 체크리스트 (배포 전)

- [ ] Supabase DB 마이그레이션 적용됨 (특히 task_devices·트리거·RPC)
- [ ] 스테이징 서버 `/app` 에 `.env.staging` 존재, 필수 변수 채워짐
- [ ] GitHub Secrets: `STAGING_DEPLOY_KEY`, `STAGING_DEPLOY_HOST`, `STAGING_DEPLOY_USER`, `STAGING_URL`
- [ ] `develop` 푸시 시 이미지 빌드·푸시·스테이징 배포·헬스체크까지 성공
- [ ] (선택) 스테이징 DB를 쓰는 에이전트는 `agent/.env`에 스테이징용 Supabase URL/키 설정

---

## 4. Supabase MCP로 DB 검증

Cursor에서 Supabase MCP가 연결되어 있으면, 스테이징/배포 전후에 DB 상태를 MCP 도구로 확인할 수 있다.

- **설정**: 프로젝트 `.cursor/mcp.json`에 Supabase MCP 등록. 최초 연결 시 브라우저에서 Supabase 로그인·권한 허용 필요.
- **권장**: 프로덕션 DB에는 MCP를 연결하지 말고, 스테이징/개발용 프로젝트에만 사용. (Supabase 권장: read-only 또는 개발용 프로젝트)

| MCP 도구 | 용도 |
|----------|------|
| `list_tables` | 테이블 목록 확인. `task_devices`, `tasks`, `devices`, `pcs` 등 존재 여부 검증. |
| `list_migrations` | 적용된 마이그레이션 목록. 로컬 `MIGRATION_ORDER.md`와 비교해 누락 여부 확인. |
| `execute_sql` | 스키마/트리거/RPC 점검. 예: `SELECT routine_name FROM information_schema.routines WHERE routine_name LIKE '%task_devices%';` |
| `get_project_url` | 프로젝트 API URL. `.env.staging`의 `NEXT_PUBLIC_SUPABASE_URL`와 일치 여부 확인. |
| `get_publishable_keys` | anon key 등. env와 동기화 여부 확인. |

예시 (AI에게 요청 시): “Supabase MCP로 list_tables 한 다음 task_devices가 있는지 확인해줘”, “list_migrations로 적용된 마이그레이션 목록 보여줘”.

---

## 5. 관련 파일

| 파일 | 용도 |
|------|------|
| `docker-compose.staging.yml` | 스테이징 Compose, 이미지·env_file·헬스체크 |
| `.env.staging.example` | 스테이징 env 템플릿 |
| `.github/workflows/ci-cd.yml` | lint → test → build → deploy-staging → health |
| `docs/ENV.md` | 웹/에이전트 env 전역 가이드 |
| `supabase/migrations/MIGRATION_ORDER.md` | DB 마이그레이션 적용 순서 |
| `DEPLOYMENT.md` | 배포 파이프라인 개요 |
| `.cursor/mcp.json` | Supabase MCP 연결 설정 (project_ref로 프로젝트 스코프) |

이 문서는 deploy-server-expert 서브에이전트 관점으로, **스테이징 배포 순서**와 **env 우선순위**를 팀이 따라가기 쉽게 정리한 것입니다. SSOT(task_devices)와의 관계는 1.1절을 따르면 됩니다.
