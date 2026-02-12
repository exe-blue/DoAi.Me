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
| 백엔드 | FastAPI on Vultr | Serverless (Vercel API Routes) |
| 태스크 큐 | Celery + Redis | Supabase Realtime + Xiaowei |
| 디바이스 제어 | uiautomator2 (Python) | Xiaowei WebSocket API + AutoJS |
| 워커 | Celery Worker (Python) | 경량 Agent (Node.js/Python) |
| 브로커 | Redis | Supabase (tasks 테이블 polling) |
| 프리셋 | 없음 | Xiaowei Action 녹화 + JS 스크립트 |
| 인프라 비용 | Vultr VPS 상시 운영 | Serverless (사용량 기반) |

### v2.1 원칙

1. **서버 없는 아키텍처**: Vultr 서버 불필요. Supabase + Vercel만으로 운영
2. **Xiaowei 최대 활용**: 31개 API로 디바이스 제어. Action 녹화/재생. AutoJS 스크립트
3. **프리셋 기반 실행**: 반복 작업은 Xiaowei Action으로 녹화 후 API 호출로 재실행
4. **DB 중심 로깅**: 모든 명령/결과를 Supabase에 기록

---

## 2. 시스템 전체 구조

```
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

```
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

### 3.2 Heartbeat 흐름

```
[매 30초] Agent → Xiaowei list API → 연결된 디바이스 상태 조회
    → Supabase workers/devices 테이블 UPSERT
    → 대시보드: Realtime으로 실시간 상태 표시
```

### 3.3 프리셋 실행 흐름

```
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

## 4. 컴포넌트 상세 (요약)

- **Web Dashboard**: Next.js 14, shadcn/ui, Zustand, Supabase Realtime
- **API Routes**: devices, workers, tasks, presets, accounts, commands
- **Node PC Agent**: Node.js, Supabase ↔ Xiaowei 중계, WebSocket `ws://127.0.0.1:22222/`
- **Xiaowei**: 31개 API (list, actionCreate, autojsCreate, pointerEvent 등)

---

## 5. Database Schema

Supabase PostgreSQL. 테이블: `workers`, `devices`, `accounts`, `presets`, `tasks`, `task_logs`, `proxies`, `channels`, `videos`, `schedules`.
스키마 상세는 `supabase/migrations/` 참조.

### YouTube Agent Farm 확장 (Phase 1+)

- **channels**: YouTube 채널 등록, 모니터링 설정
- **videos**: 영상 목록 (수동/자동 감지)
- **schedules**: 채널별 스케줄 (on_upload, interval, cron)
- **tasks**: `video_id`, `channel_id`, `task_type` 컬럼 추가

---

## 6. 디렉토리 구조

- **웹**: `app/` (Next.js App Router), `components/`, `lib/`
- **Agent**: `agent/` (Node.js, 배포용)
- **스크립트**: `scripts/` (Xiaowei AutoJS)

---

*이 문서는 프로젝트의 Single Source of Truth입니다. 변경 시 이 문서를 먼저 업데이트합니다.*
