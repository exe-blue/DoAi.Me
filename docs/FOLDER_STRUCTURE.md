# 디렉토리 구조

DoAi.Me v2.1 프로젝트의 폴더 구조 및 규칙입니다.

---

## 0. 모노레포 구성

루트에는 **앱 루트**와 **패키지 루트** 두 가지가 있습니다.

| 루트 | 용도 | 내용 |
| ------ | ------ | ------ |
| **app/** | Next.js 웹앱 (App Router) | 페이지·API·레이아웃. `npm run dev` / `next build`의 진입점. |
| **packages/** | 워크스페이스 패키지 | `package.json`의 `workspaces: ["packages/*"]`로 링크. 예: `packages/agent-electron` (Electron 앱). |

그 외 **agent/**(Node PC Agent), **components/**, **lib/**, **hooks/**, **scripts/**, **supabase/**, **docs/** 등은 루트에 두고, Next 빌드·실행은 **app/** 및 이 루트 디렉터리들을 함께 사용합니다.

---

## 1. 프로젝트 루트

```
doai.me/
├── app/                      # (앱 루트) Next.js App Router
├── packages/                 # (패키지 루트) workspaces (예: agent-electron)
├── components/               # 웹 공용 컴포넌트
├── lib/                      # 웹 공용 라이브러리
├── hooks/
├── agent/                    # Node PC Agent (별도 배포)
├── scripts/
├── supabase/
│   └── migrations/
├── docs/
├── .cursor/
├── package.json              # workspaces: ["packages/*"]
├── next.config.js
└── tailwind.config.ts
```

---

## 2. 웹 (Next.js)

```
app/
├── layout.tsx                # 루트 레이아웃 (Pretendard, Toaster)
├── page.tsx                  # Dashboard 메인 (탭 기반)
└── api/                      # Serverless API Routes
    ├── devices/route.ts
    ├── workers/
    │   ├── route.ts
    │   └── heartbeat/route.ts
    ├── tasks/route.ts
    ├── presets/route.ts
    ├── accounts/route.ts
    └── commands/route.ts

components/
├── ui/                       # shadcn/ui (Radix 기반)
├── app-sidebar.tsx           # 사이드바
├── devices-page.tsx          # 디바이스 탭
├── presets-page.tsx          # 명령 프리셋 탭
├── tasks-page.tsx            # 작업 관리 탭
├── channels-page.tsx         # 채널 및 컨텐츠 탭
├── logs-page.tsx             # 실행내역 탭
└── farm/                     # 도메인 컴포넌트 (추가 시)

hooks/
├── use-mobile.tsx            # 사이드바 반응형
└── use-toast.ts              # 토스트

lib/
├── supabase/
│   ├── client.ts             # Supabase 클라이언트
│   └── types.ts              # DB 타입 정의
├── utils.ts                  # cn() 등
├── types.ts                  # 도메인 타입 (NodePC, Device, Task 등)
└── mock-data.ts              # 개발용 목 데이터
```

---

## 3. Node PC Agent

```
agent/
├── agent.js                  # 메인 엔트리
├── xiaowei-client.js         # Xiaowei WebSocket 클라이언트
├── supabase-sync.js          # Supabase 연동
├── task-executor.js          # 태스크 실행
├── heartbeat.js              # Heartbeat 로직
├── config.js                 # 설정 로딩
├── package.json
└── .env.template
```

---

## 4. 노드PC (Windows) 로컬 구조

Agent 배포 시 Windows PC에서 참조하는 경로:

```
C:\Users\[user]\
├── farm_config/              # 설정 파일
│   ├── proxy_list.txt
│   ├── proxy_map.txt
│   └── account_map.json
├── farm_scripts/             # AutoJS 스크립트 (동기화 대상)
│   ├── youtube_watch.js
│   ├── youtube_search.js
│   └── ...
├── farm_agent/               # Agent 프로그램
│   ├── agent.js
│   ├── .env
│   └── ...
├── farm_logs/                # 로컬 로그
└── farm_screenshots/         # 스크린샷 저장
```

---

## 5. 규칙

| 규칙 | 설명 |
|------|------|
| **app/** | Next.js App Router 전용. 페이지는 `page.tsx`, API는 `api/*/route.ts` |
| **components/** | `ui/` = shadcn 재사용, `farm/` = 도메인별 |
| **lib/** | 공통 유틸, Supabase 클라이언트, 타입 |
| **agent/** | 독립 실행. `npm run start`로 Node PC에서 실행 |
| **scripts/** | 저장소에 보관. 노드PC `farm_scripts/`로 동기화 배포 |
