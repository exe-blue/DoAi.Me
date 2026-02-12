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

## 트러블슈팅

### Webpack 캐시 오류

Next.js 개발 서버에서 다음과 같은 오류가 발생하는 경우:
```
Error: ENOENT: no such file or directory, stat '.next/cache/webpack/...'
```

**원인**: 동시 빌드 프로세스나 캐시 처리 문제로 인한 webpack 캐시 손상

**해결 방법**:

```bash
# 전체 .next 폴더 삭제
npm run clean

# 또는 캐시만 삭제
npm run clean:cache

# 이후 개발 서버 재시작
npm run dev
```

필요한 경우 종속성 재설치:
```bash
npm install
```
