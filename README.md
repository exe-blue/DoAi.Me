# DoAi.Me v2.1

500 Galaxy S9 | 5 Node PCs | Serverless Backend

YouTube 자동 시청 파밍 시스템. 500대 물리 디바이스를 5대의 Node PC로 관제하고, Supabase Broadcast 기반 실시간 대시보드로 모니터링합니다.

## 프로젝트 구조

```
doai.me/
├── app/                     # Next.js 14 App Router
│   ├── api/                 # API Routes (19개)
│   │   ├── workers/         # 워커 CRUD + heartbeat
│   │   ├── devices/         # 디바이스 CRUD
│   │   ├── tasks/           # 태스크 CRUD
│   │   ├── accounts/        # 계정 풀
│   │   ├── presets/         # 명령 프리셋
│   │   ├── channels/        # 채널 관리
│   │   ├── youtube/         # YouTube 동기화
│   │   ├── proxies/         # 프록시 관리
│   │   ├── stats/           # 통계
│   │   ├── logs/            # 로그 조회
│   │   └── health/          # 헬스체크
│   ├── dashboard/           # 대시보드 페이지 (8개 라우트)
│   └── layout.tsx           # 루트 레이아웃
├── components/
│   ├── ui/                  # shadcn/ui + Magic UI 컴포넌트
│   └── dashboard/           # 대시보드 공유 컴포넌트
├── hooks/                   # Zustand 스토어 + Realtime 훅
│   ├── use-workers-store.ts
│   ├── use-tasks-store.ts
│   ├── use-logs-store.ts
│   ├── use-stats-store.ts
│   ├── use-presets-store.ts
│   ├── use-proxies-store.ts
│   └── use-realtime.ts      # Supabase Broadcast 구독
├── lib/
│   ├── supabase/            # Supabase 클라이언트 + 타입
│   ├── db/                  # 서버사이드 쿼리 함수
│   ├── types.ts             # 프론트엔드 타입
│   └── schemas.ts           # Zod 스키마
├── agent/                   # Node PC Agent (각 PC에서 실행)
│   ├── src/
│   │   ├── agent.ts         # 메인 에이전트
│   │   ├── xiaowei-client.ts # Xiaowei WebSocket 클라이언트
│   │   ├── supabase-sync.ts # Supabase 동기화
│   │   └── broadcaster.ts   # Broadcast 이벤트 발행
│   ├── agent.js             # 레거시 CommonJS 에이전트
│   └── package.json
├── tests/
│   ├── e2e-local.js         # E2E 테스트 (전체 파이프라인)
│   ├── seed-channels.js     # 채널/비디오 시드 스크립트
│   └── run-api-tests.js     # API 라우트 테스트
├── supabase/
│   ├── migrations/          # SQL 마이그레이션
│   └── verify_schema.sql    # 스키마 검증 쿼리
└── package.json
```

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
cp .env.example .env.local
# .env.local 에 Supabase URL, Keys, YouTube API Key 설정

npm install
npm run dev          # http://localhost:3000
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
npm run test:e2e

# 클린업 없이 실행 (디버깅용)
node tests/e2e-local.js --no-cleanup
```

## npm scripts

| 스크립트 | 설명 |
| ---------- | ------ |
| `dev` | Next.js 개발 서버 |
| `build` | 프로덕션 빌드 |
| `lint` | ESLint |
| `test` | Vitest 유닛 테스트 |
| `test:e2e` | E2E 전체 파이프라인 테스트 |
| `test:api` | API 라우트 테스트 |
| `agent:dev` | Agent TypeScript watch 모드 |
| `agent:start` | Agent 프로덕션 실행 |
| `db:verify` | Supabase 스키마 검증 |
| `clean` | .next 폴더 삭제 |

## 스택

- **웹**: Next.js 14 (App Router), React 18, TypeScript, Tailwind, shadcn/ui, Magic UI, Zustand
- **Agent**: Node.js, TypeScript, Xiaowei WebSocket, Winston logger
- **DB**: Supabase PostgreSQL (Pro Plan)
- **Realtime**: Supabase Broadcast (pg_net + 토픽 기반)
- **인프라**: Vercel (Dashboard), Windows PC (Agent)

## Broadcast 토픽

| 토픽 | 용도 |
| ------ | ------ |
| `room:dashboard` | 전체 통계 |
| `room:workers` | 워커 목록 변경 |
| `room:worker:<id>` | 개별 워커 상태 |
| `room:devices` | 500대 디바이스 그리드 |
| `room:tasks` | 태스크 목록 변경 |
| `room:task:<id>:logs` | 개별 태스크 로그 스트림 |
| `room:task_logs` | 전체 로그 모니터링 |
| `room:system` | 시스템 알림 |

## 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 아키텍처 상세
