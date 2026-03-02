# DoAi.Me v2.1

Dev Container에서만 개발/빌드/테스트한다.

500 Galaxy S9 | 5 Node PCs | Serverless Backend

YouTube 자동 시청 파밍 시스템. 500대 물리 디바이스를 5대의 Node PC로 관제하고, Supabase Broadcast 기반 실시간 대시보드로 모니터링합니다.

## 사전 요구사항 (pnpm 설치)

이 레포는 **pnpm**으로 의존성을 관리합니다. `pnpm`이 설치되어 있지 않으면 다음 중 하나를 실행하세요.

1. **Node.js 설치 후 Corepack 사용 (권장)**  
   [Node.js LTS](https://nodejs.org/) 설치 후 터미널에서:
   ```bash
   corepack enable
   corepack prepare pnpm@10.29.3 --activate
   ```
2. **npm으로 pnpm 전역 설치**  
   Node.js가 이미 있다면:
   ```bash
   npm install -g pnpm
   ```

설치 후 `pnpm install`, `pnpm run build` 등이 동작해야 합니다. `pnpm: The term 'pnpm' is not recognized` 오류가 나면 위 단계를 진행한 **새 터미널**을 열어 다시 시도하세요.

## 프로젝트 구조 (모노레포)

```
doai.me/
├── apps/
│   └── web/                 # Next.js 대시보드 (웹 앱 루트)
│       ├── app/             # App Router (api/, (app)/ 등)
│       ├── src/             # components, hooks, lib, types
│       ├── public/
│       ├── next.config.js
│       ├── package.json     # @doai/web
│       └── vercel.json      # Cron 등
├── packages/                # shared, supabase, typescript-config, agent
│   └── agent/               # Node PC Agent (@doai/agent, 각 PC에서 실행)
├── supabase/
├── pnpm-workspace.yaml
└── package.json             # 루트: pnpm --filter @doai/web dev/build
```

**Vercel 배포**: 프로젝트 설정에서 Root Directory를 `apps/web`으로 지정하세요.

## 환경 변수 (Environment variables)

- **웹**, **데스크톱**, **에이전트** 모두 **레포 루트**의 `.env`, `.env.local`, `.env.prod` 등을 참조합니다.
- 루트에 `.env.example`을 복사해 `.env` 또는 `.env.local`로 저장한 뒤 값을 채우세요. `.env`, `.env.local`, `.env.prod`는 커밋하지 마세요 (`.gitignore`에 포함됨).
- Supabase 키: [Supabase 대시보드 > Project Settings > API](https://supabase.com/dashboard/project/_/settings/api)
- Sentry: [Sentry 설정](https://sentry.io/settings/)에서 DSN 및 auth token 발급

## 로컬 실행

### 1. Supabase 설정

```bash
# Supabase 프로젝트 생성 후 마이그레이션 실행
npx supabase db push

# 스키마 검증 (원격 연결. 로컬 DB 없이 실행 가능. 먼저 `npx supabase link` 필요)
pnpm run db:verify
```

### 2. Dashboard (Next.js)

```bash
cp .env.example .env.local
# 루트 .env.local 에 Supabase URL, Keys, YouTube API Key 설정

pnpm install
pnpm run dev         # http://localhost:3000
```

### 3. Agent (Node PC)

```bash
cd packages/agent
cp ../../.env.example .env
# .env 에 WORKER_NAME, Supabase, Xiaowei 설정

pnpm install         # 루트에서 pnpm install 시 워크스페이스로 설치됨
node agent.js        # 또는 pnpm start
```

## npm scripts

| 스크립트      | 설명                        |
| ------------- | --------------------------- |
| `dev`         | Next.js 개발 서버           |
| `build`       | 프로덕션 빌드               |
| `lint`        | ESLint                      |
| `test`        | Vitest 유닛 테스트          |
| `agent:dev`   | Agent watch 모드 (packages/agent) |
| `agent:start` | Agent 프로덕션 실행 (packages/agent) |
| `db:verify`   | Supabase 스키마 검증        |
| `clean`       | .next 폴더 삭제             |

## 스택

- **웹**: Next.js 14 (App Router), React 18, TypeScript, Tailwind, shadcn/ui, Magic UI, Zustand
- **Agent**: Node.js, TypeScript, Xiaowei WebSocket, Winston logger
- **DB**: Supabase PostgreSQL (Pro Plan)
- **Realtime**: Supabase Broadcast (pg_net + 토픽 기반)
- **인프라**: Vercel (Dashboard), Windows PC (Agent)

## Broadcast 토픽

| 토픽                  | 용도                    |
| --------------------- | ----------------------- |
| `room:dashboard`      | 전체 통계               |
| `room:workers`        | 워커 목록 변경          |
| `room:worker:<id>`    | 개별 워커 상태          |
| `room:devices`        | 500대 디바이스 그리드   |
| `room:tasks`          | 태스크 목록 변경        |
| `room:task:<id>:logs` | 개별 태스크 로그 스트림 |
| `room:task_logs`      | 전체 로그 모니터링      |
| `room:system`         | 시스템 알림             |

## 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 아키텍처 상세
