# DoAi.Me v2.1

500 Galaxy S9 | 5 Node PCs | Serverless Backend

## 문서

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 아키텍처 (Single Source of Truth)
- [docs/ENV.md](./docs/ENV.md) - 환경 변수
- [docs/FOLDER_STRUCTURE.md](./docs/FOLDER_STRUCTURE.md) - 폴더 구조

## 시작하기

### 웹 (Next.js)

```bash
cp .env.example .env.local
# .env.local에 Supabase URL, Keys 설정

npm install
npm run dev
```

### Agent (Node PC)

```bash
cd agent
cp .env.template .env
# .env에 WORKER_NAME, Supabase 설정

npm install
npm start
```

### Supabase

1. [Supabase](https://supabase.com) 프로젝트 생성
2. `supabase/migrations/00001_initial_schema.sql` 실행
3. `.env.local`에 URL, Keys 설정

## 스택

- **웹**: Next.js 14, Tailwind, Supabase, Zustand
- **Agent**: Node.js, Xiaowei WebSocket
- **인프라**: Vercel, Supabase
