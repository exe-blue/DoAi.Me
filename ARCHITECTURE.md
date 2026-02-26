# DoAi.Me v2.1 아키텍처

> **Status**: Fresh Start | **Date**: 2026-02-12
> **Scale**: 500 Galaxy S9 | 5 Node PCs | Serverless Backend
> **Core Change**: FastAPI 제거 → Serverless | Celery 제거 → Xiaowei WebSocket API
> **Device Control**: Xiaowei (효위투핑) — `ws://127.0.0.1:22222/`

---

## 1. 왜 다시 시작하는가

### v1 → v2.1 핵심 변경

| 항목 | v1 (폐기) | v2.1 (신규) |
| --- | --- | --- |
| 백엔드 | FastAPI (자체 서버) | Serverless (Vercel API Routes) |
| 태스크 큐 | Celery + Redis | Supabase Realtime + Xiaowei |
| 디바이스 제어 | uiautomator2 (Python) | Xiaowei WebSocket API + AutoJS |
| 워커 | Celery Worker (Python) | 경량 Agent (Node.js/Python) |
| 브로커 | Redis | Supabase (tasks 테이블 polling) |
| 프리셋 | 없음 | Xiaowei Action 녹화 + JS 스크립트 |
| 인프라 비용 | VPS 상시 운영 | Serverless (사용량 기반) |

### v2.1 원칙

1. **서버 없는 아키텍처**: 별도 서버 불필요. Supabase + Vercel만으로 운영
2. **Xiaowei 최대 활용**: 31개 API로 디바이스 제어. Action 녹화/재생. AutoJS 스크립트
3. **프리셋 기반 실행**: 반복 작업은 Xiaowei Action으로 녹화 후 API 호출로 재실행
4. **DB 중심 로깅**: 모든 명령/결과를 Supabase에 기록

---

## 2. 시스템 전체 구조

```text
┌─────────────────────────────────────────────────────────┐
│                    USER / OPERATOR                       │
│                  Web Dashboard (Browser)                 │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS
                       ▼
┌─────────────────────────────────────────────────────────┐
│              CLOUD LAYER (Serverless)                    │
│  ┌──────────────────┐  ┌────────────────────────────┐  │
│  │  Vercel           │  │  Supabase                   │  │
│  │  ├─ Next.js App   │  │  ├─ PostgreSQL (DB)         │  │
│  │  ├─ API Routes    │  │  ├─ Realtime (변경 구독)     │  │
│  │  └─ (Serverless)  │  │  ├─ Edge Functions          │  │
│  │                   │  │  └─ Storage (스크린샷)       │  │
│  └──────────────────┘  └────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                       │ Supabase Realtime (WebSocket)
          ┌────────────┼────────────┐
          │            │            │        ... (x5)
          ▼            ▼            ▼
┌──────────────┐┌──────────────┐┌──────────────┐
│  Node PC 01  ││  Node PC 02  ││  Node PC 03  │
│  (Windows)   ││  (Windows)   ││  (Windows)   │
│ ┌──────────┐ ││ ┌──────────┐ ││ ┌──────────┐ │
│ │ Xiaowei  │ ││ │ Xiaowei  │ ││ │ Xiaowei  │ │
│ │ ws:22222 │ ││ │ ws:22222 │ ││ │ ws:22222 │ │
│ └────┬─────┘ ││ └────┬─────┘ ││ └────┬─────┘ │
│      │       ││      │       ││      │       │
│ ┌────┴─────┐ ││ ┌────┴─────┐ ││ ┌────┴─────┐ │
│ │  Agent   │ ││ │  Agent   │ ││ │  Agent   │ │
│ │ Supabase │ ││ │ Supabase │ ││ │ Supabase │ │
│ │ ↔ Xiaowei│ ││ │ ↔ Xiaowei│ ││ │ ↔ Xiaowei│ │
│ └──────────┘ ││ └──────────┘ ││ └──────────┘ │
│ ┌──┐┌──┐x100││ ┌──┐┌──┐x100││ ┌──┐┌──┐x100│
│ │S9││S9│    ││ │S9││S9│    ││ │S9││S9│    │
│ └──┘└──┘    ││ └──┘└──┘    ││ └──┘└──┘    │
│  (USB/OTG)  ││  (USB/OTG)  ││  (USB/OTG)  │
└──────────────┘└──────────────┘└──────────────┘
```

---

## 3. 핵심 흐름

### 3.1 명령 실행 흐름 (Dashboard → Device)

```text
[1] 대시보드에서 "동영상 시청" 작업 생성
    → Vercel API Route → Supabase tasks INSERT (status='pending')

[2] Node PC의 Agent가 Supabase Realtime 구독 중
    → tasks 테이블 변경 감지 (자기 worker_id 필터)
    → status='pending' → 'running' UPDATE

[3] Agent → Xiaowei WebSocket (ws://127.0.0.1:22222/)
    → 프리셋 실행: actionCreate (녹화된 동작)
    → 또는 스크립트: autojsCreate (JS 파일)
    → 또는 직접 제어: adb_shell, pointerEvent, inputText 등

[4] 실행 완료
    → Agent → Supabase tasks UPDATE (status='done', result={...})
    → Supabase Realtime → 대시보드 자동 반영
```

### 3.2 인증 흐름 (Supabase Auth)

```text
[로그인] /login → Supabase signInWithPassword / signUp
    → /auth/callback (Magic Link 시) → exchangeCodeForSession → /dashboard

[대시보드] middleware → supabase.auth.getUser() → 세션 갱신
    → 비인증 시 /login?returnTo=... 리다이렉트

[작업 생성] POST /api/tasks (세션)
    → createAuthServerClient().auth.getUser() → createdByUserId (user.id)
    → tasks INSERT (created_by = auth user id)

[Agent/API Key] POST /api/tasks (x-api-key)
    → created_by = NULL
```

### 3.3 Heartbeat 흐름

```text
[매 30초] Agent → Xiaowei list API → 연결된 디바이스 상태 조회
    → Supabase workers/devices 테이블 UPSERT
    → 대시보드: Realtime으로 실시간 상태 표시
```

### 3.4 프리셋 실행 흐름

```text
[사전 준비] Xiaowei UI에서 동작 녹화
    → "YouTube_시청_30초", "YouTube_검색_구독" 등 프리셋 저장

[실행] API 호출:
    {
      "action": "actionCreate",
      "devices": "serial1,serial2",
      "data": [{
        "actionName": "YouTube_시청_30초",
        "count": 1,
        "taskInterval": [1000, 3000],
        "deviceInterval": "500"
      }]
    }

[JS 스크립트] 복잡한 시나리오:
    {
      "action": "autojsCreate",
      "devices": "all",
      "data": [{
        "path": "D:\\farm_scripts\\youtube_watch.js",
        "count": 1,
        "taskInterval": [2000, 5000],
        "deviceInterval": "1000"
      }]
    }
```

---

## 4. 컴포넌트 상세

### 4.1 Web Dashboard (Next.js 14)

**메인 페이지**

- `app/page.tsx` — 탭 라우팅, Zustand store 통합, lazy loading

**UI 컴포넌트**

- `components/app-sidebar.tsx` — 노드/디바이스 상태 카운트
- `components/devices-page.tsx` — 디바이스 관리
- `components/presets-page.tsx` — 프리셋 관리
- `components/tasks-page.tsx` — 작업 관리
- `components/channels-page.tsx` — 채널/콘텐츠 관리
- `components/logs-page.tsx` — 로그 뷰어

**Zustand Stores (6개)**

- `hooks/use-workers-store.ts` — workers + devices → NodePC[]
- `hooks/use-tasks-store.ts` — 작업 목록 fetch
- `hooks/use-channels-store.ts` — 채널 + 콘텐츠
- `hooks/use-presets-store.ts` — 프리셋 CRUD
- `hooks/use-logs-store.ts` — 페이지네이션 로그
- `hooks/use-stats-store.ts` — 대시보드 통계

**Realtime Hooks**

- `hooks/use-realtime.ts` — Broadcast 기반 실시간 구독 훅
  - `useTasksBroadcast` — room:tasks 채널 (INSERT/UPDATE/DELETE)
  - `useTaskLogsBroadcast` — room:task:\<id\>:logs 채널 (개별 태스크 로그)
  - `useAllTaskLogsBroadcast` — room:task_logs 채널 (전체 로그 모니터링)
  - `useBroadcast` — 범용 Broadcast 구독

### 4.2 API Routes (19개)

**워커/디바이스**

- `app/api/workers/route.ts` — GET (디바이스 카운트 포함)
- `app/api/workers/[id]/route.ts` — GET (워커 + 디바이스)
- `app/api/workers/heartbeat/route.ts` — POST (Agent 하트비트)
- `app/api/devices/route.ts` — GET (worker_id/status 필터)
- `app/api/devices/[id]/route.ts` — GET, PUT

**계정/프리셋/작업**

- `app/api/accounts/route.ts` — GET, POST
- `app/api/accounts/[id]/route.ts` — GET, PUT
- `app/api/presets/route.ts` — GET, POST
- `app/api/presets/[id]/route.ts` — GET, PUT, DELETE
- `app/api/tasks/route.ts` — GET, POST, PATCH, DELETE

**YouTube 관리**

- `app/api/channels/route.ts` — GET (채널 + 영상 매핑)
- `app/api/schedules/route.ts` — GET, POST, PATCH, DELETE
- `app/api/youtube/channels/route.ts` — GET, POST (핸들 resolve)
- `app/api/youtube/videos/route.ts` — GET (최신 영상)
- `app/api/youtube/sync/route.ts` — GET (전체 채널 동기화)

**통계/로그**

- `app/api/stats/route.ts` — GET (대시보드 집계)
- `app/api/logs/route.ts` — GET (페이지네이션)
- `app/api/health/route.ts` — GET (상태 체크)

### 4.3 Node PC Agent (6개 모듈)

- `agent/agent.js` — 메인 오케스트레이터: 초기화, Realtime 구독, task polling, graceful shutdown
- `agent/xiaowei-client.js` — WebSocket 클라이언트 (자동 재연결, request/response 추적)
  - 메서드: `list`, `actionCreate`, `autojsCreate`, `adbShell`, `pointerEvent`, `inputText`
- `agent/supabase-sync.js` — worker 등록, device upsert, task CRUD, Broadcast + postgres_changes 구독
- `agent/heartbeat.js` — 30초 주기 디바이스 동기화, offline 감지
- `agent/task-executor.js` — task 타입별 실행 (watch_video, subscribe, like, comment, custom, action, script, adb)
- `agent/config.js` — .env 설정 로드

### 4.4 Data Layer

**Supabase 클라이언트**

- `lib/supabase/server.ts` — 서버용 (SERVICE_ROLE_KEY)
- `lib/supabase/client.ts` — 브라우저용 (anon key)
- `lib/supabase/types.ts` — Database 인터페이스 (10개 테이블)

**DB 헬퍼**

- `lib/db/channels.ts` — getAllChannels, upsertChannel, deleteChannel, updateChannelMonitoring
- `lib/db/videos.ts` — getVideos*, upsertVideo, updateVideoStatus
- `lib/db/tasks.ts` — getTasks*, createTask, updateTask, deleteTask, getTaskLogs, getTaskByVideoId
- `lib/db/schedules.ts` — get/create/update/delete schedules, updateScheduleLastTriggered

**비즈니스 로직**

- `lib/mappers.ts` — DB Row → Frontend Type 변환
- `lib/pipeline.ts` — 스케줄 기반 자동 작업 생성
- `lib/youtube.ts` — YouTube Data API v3 (resolveChannelHandle, fetchRecentVideos)
- `lib/types.ts` — 프론트엔드 타입 정의

### 4.5 Xiaowei API

WebSocket `ws://127.0.0.1:22222/` — 31개 API 중 주요 사용:

- `list` — 디바이스 목록
- `actionCreate` — 녹화된 동작 재생
- `autojsCreate` — JS 스크립트 실행
- `adbShell` — ADB 명령
- `pointerEvent` — 터치 이벤트
- `inputText` — 텍스트 입력

---

## 5. Database Schema

Supabase PostgreSQL — 10개 테이블 (마이그레이션: `supabase/migrations/`)

### Realtime & Broadcast

- **Publication**: `supabase_realtime` — tasks, task_logs, workers, devices
- **Broadcast**: DB 트리거 → `pg_net` HTTP → Realtime Broadcast API
  - `room:tasks` — tasks INSERT/UPDATE/DELETE
  - `room:task:<id>:logs` — 개별 태스크 로그
  - `room:task_logs` — 전체 로그 모니터링
- **Vault 시크릿**: `supabase_url`, `supabase_service_role_key` (pg_net 인증용)

### pg_cron 스케줄 작업

| Job | 주기 | 설명 |
| --- | --- | --- |
| cleanup-old-task-logs | 매일 03:00 UTC | 30일 이상 로그 삭제 |
| mark-stale-workers-offline | 매 2분 | 5분 이상 heartbeat 없는 워커 offline |
| reset-stuck-tasks | 매 10분 | 1시간 이상 running 태스크 failed 처리 |
| archive-old-tasks | 매주 일 04:00 UTC | 90일 이상 완료 태스크 삭제 |
| cleanup-stale-devices | 매일 03:30 UTC | 7일 이상 미접속 디바이스 offline |

### 핵심 테이블

**workers** — Node PC 워커

- `id`, `name`, `status`, `last_heartbeat`, `metadata`

**devices** — Galaxy S9 디바이스

- `id`, `worker_id`, `serial`, `name`, `model`, `android_version`, `status`, `last_seen`, `capabilities`

**accounts** — YouTube/Google 계정

- `id`, `email`, `password`, `recovery_email`, `phone`, `status`, `device_id`, `metadata`

**presets** — Xiaowei 프리셋 (Action/Script)

- `id`, `name`, `description`, `type` (action/script), `action_name`, `script_path`, `params`, `task_interval`, `device_interval`

**tasks** — 작업 큐

- `id`, `worker_id`, `device_id`, `account_id`, `preset_id`, `task_type`, `status`, `priority`, `params`, `result`, `video_id`, `channel_id`, `created_by` (Supabase auth user id), `created_at`, `started_at`, `completed_at`

**task_logs** — 작업 실행 로그

- `id`, `task_id`, `level`, `message`, `metadata`, `created_at`

**proxies** — 프록시 서버

- `id`, `host`, `port`, `username`, `password`, `protocol`, `status`, `country`

### YouTube Agent Farm 테이블

**channels** — YouTube 채널 모니터링

- `id`, `channel_id`, `channel_handle`, `channel_name`, `thumbnail_url`, `subscriber_count`, `monitoring_enabled`, `last_synced_at`, `metadata`

**videos** — YouTube 영상

- `id`, `video_id`, `channel_id`, `title`, `thumbnail_url`, `published_at`, `duration`, `view_count`, `status`, `task_created`, `metadata`

**schedules** — 채널별 스케줄

- `id`, `channel_id`, `trigger_type` (on_upload/interval/cron), `task_types`, `enabled`, `interval_minutes`, `cron_expression`, `last_triggered_at`, `params`

---

## 6. 디렉토리 구조

```text
doai.me/
├── app/                          # Next.js App Router
│   ├── api/                      # API Routes (19개)
│   │   ├── workers/              # GET, GET/:id, POST /heartbeat
│   │   ├── devices/              # GET, GET/:id, PUT/:id
│   │   ├── accounts/             # GET, POST, GET/:id, PUT/:id
│   │   ├── presets/              # GET, POST, GET/:id, PUT/:id, DELETE/:id
│   │   ├── tasks/                # GET, POST, PATCH, DELETE
│   │   ├── channels/             # GET (channels + videos)
│   │   ├── schedules/            # GET, POST, PATCH, DELETE
│   │   ├── stats/                # GET (dashboard aggregations)
│   │   ├── logs/                 # GET (paginated task_logs)
│   │   ├── youtube/              # YouTube API wrapper
│   │   │   ├── channels/         # GET, POST (handle resolve)
│   │   │   ├── videos/           # GET (recent videos)
│   │   │   └── sync/             # GET (sync all channels)
│   │   └── health/               # GET (health check)
│   ├── page.tsx                  # 메인 페이지 (탭 라우팅)
│   ├── layout.tsx                # 루트 레이아웃
│   └── globals.css               # 전역 스타일
│
├── components/                   # UI 컴포넌트
│   ├── app-sidebar.tsx           # 사이드바 (노드/디바이스 상태)
│   ├── devices-page.tsx          # 디바이스 관리
│   ├── presets-page.tsx          # 프리셋 관리
│   ├── tasks-page.tsx            # 작업 관리
│   ├── channels-page.tsx         # 채널/콘텐츠 관리
│   ├── logs-page.tsx             # 로그 뷰어
│   └── ui/                       # shadcn/ui 컴포넌트
│
├── hooks/                        # Zustand Stores + Realtime
│   ├── use-workers-store.ts      # workers + devices → NodePC[]
│   ├── use-tasks-store.ts        # 작업 목록
│   ├── use-channels-store.ts     # 채널 + 콘텐츠
│   ├── use-presets-store.ts      # 프리셋 CRUD
│   ├── use-logs-store.ts         # 페이지네이션 로그
│   ├── use-stats-store.ts        # 대시보드 통계
│   └── use-realtime.ts           # Broadcast 실시간 구독 훅
│
├── lib/                          # 데이터 레이어
│   ├── supabase/                 # Supabase 클라이언트
│   │   ├── server.ts             # 서버용 (SERVICE_ROLE_KEY)
│   │   ├── client.ts             # 브라우저용 (anon key)
│   │   └── types.ts              # Database 인터페이스
│   ├── db/                       # DB 헬퍼
│   │   ├── channels.ts           # 채널 CRUD
│   │   ├── videos.ts             # 영상 CRUD
│   │   ├── tasks.ts              # 작업 CRUD
│   │   └── schedules.ts          # 스케줄 CRUD
│   ├── mappers.ts                # DB Row → Frontend Type
│   ├── pipeline.ts               # 스케줄 기반 자동 작업 생성
│   ├── youtube.ts                # YouTube Data API v3
│   └── types.ts                  # 프론트엔드 타입
│
├── agent/                        # Node PC Agent (6개 모듈)
│   ├── agent.js                  # 메인 오케스트레이터
│   ├── xiaowei-client.js         # WebSocket 클라이언트
│   ├── supabase-sync.js          # Worker/Device 동기화
│   ├── heartbeat.js              # 30초 주기 상태 체크
│   ├── task-executor.js          # Task 타입별 실행
│   ├── config.js                 # .env 설정
│   └── package.json              # Agent 의존성
│
├── supabase/                     # Supabase 설정
│   ├── migrations/               # DB 마이그레이션
│   │   ├── 00001_initial_schema.sql         # 핵심 테이블 (7개)
│   │   ├── 00002_channels_videos_schedules.sql # YouTube 확장 (3개)
│   │   ├── 00003_realtime_broadcast.sql     # Realtime + Vault + Broadcast 트리거
│   │   └── 00004_pg_cron_jobs.sql           # pg_cron 스케줄 작업
│   └── config.toml               # Supabase 프로젝트 설정
│
└── scripts/                      # Xiaowei AutoJS 스크립트
    └── youtube_watch.js          # 예시 스크립트
```

---

*이 문서는 프로젝트의 Single Source of Truth입니다. 변경 시 이 문서를 먼저 업데이트합니다.*
