# DoAi.Me v2.1

Dev Container에서만 개발/빌드/테스트한다.

500 Galaxy S9 | 5 Node PCs | Serverless Backend

YouTube 자동 시청 파밍 시스템. 500대 물리 디바이스를 5대의 Node PC로 관제하고, Supabase Broadcast 기반 실시간 대시보드로 모니터링합니다.

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
├── packages/                # shared, supabase, ui
├── agent/                   # Node PC Agent (각 PC에서 실행)
├── tests/
├── supabase/
├── pnpm-workspace.yaml
└── package.json             # 루트: pnpm --filter @doai/web dev/build
```

**Vercel 배포**: 프로젝트 설정에서 Root Directory를 `apps/web`으로 지정하세요.

## 로컬 실행

### 1. Supabase 설정

```bash
# Supabase 프로젝트 생성 후 마이그레이션 실행
npx supabase db push

# 스키마 검증
npm run db:verify
```

### 2. Dashboard (Next.js)

```bash
cp apps/web/.env.example apps/web/.env.local
# apps/web/.env.local 에 Supabase URL, Keys, YouTube API Key 설정

pnpm install
pnpm run dev         # http://localhost:3000
```

### 3. Agent (Node PC)

```bash
cd agent
cp .env.example .env
# .env 에 WORKER_NAME, Supabase, Xiaowei 설정

npm install
npm run build        # TypeScript 빌드
npm start            # dist/agent.js 실행
# 또는
npm run dev          # tsc --watch (개발용)
```

## E2E 테스트

전체 파이프라인을 검증합니다: 채널 조회 → 비디오 선택 → 태스크 생성 → Agent 실행 → 로그 추적 → 상태 검증

```bash
# 사전 조건:
# 1. Agent 실행 중 (cd agent && npm start)
# 2. Xiaowei 실행 중 (localhost:22222)
# 3. DB에 채널+비디오 데이터 존재

# 채널 시드 (최초 1회)
node tests/seed-channels.js

# E2E 테스트 실행
pnpm run test:e2e

# 클린업 없이 실행 (디버깅용)
node tests/e2e-local.js --no-cleanup
```

## npm scripts

| 스크립트      | 설명                        |
| ------------- | --------------------------- |
| `dev`         | Next.js 개발 서버           |
| `build`       | 프로덕션 빌드               |
| `lint`        | ESLint                      |
| `test`        | Vitest 유닛 테스트          |
| `test:e2e`    | E2E 전체 파이프라인 테스트  |
| `test:api`    | API 라우트 테스트           |
| `agent:dev`   | Agent TypeScript watch 모드 |
| `agent:start` | Agent 프로덕션 실행         |
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
