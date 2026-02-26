# DoAi.me — YouTube Agent Farm 구현 계획서

> **Orchestrator**: Planner (Ultrawork + Ultrapilot) | **QA**: UltraQA (Phase별 기능 테스트)  
> **Date**: 2026-02-12 | **Status**: Planning

---

## 1. 사양 vs 기존 아키텍처 충돌 해결

### 1.1 핵심 충돌 요약

| 항목 | 스펙 (YouTube Agent Farm) | 기존 (v2.1) | **결정** |
|------|---------------------------|-------------|----------|
| 백엔드 | FastAPI | Vercel API Routes | **Vercel API Routes 유지** |
| 태스크 큐 | Celery + Redis | Supabase Realtime + Xiaowei | **Supabase Realtime 유지** |
| 디바이스 제어 | TCP Socket 127.0.0.1:22222 | Xiaowei WebSocket ws://127.0.0.1:22222/ | **Xiaowei WebSocket 유지** |
| 채널/영상 | channels, videos 테이블 | 없음 | **추가** (신규 마이그레이션) |
| tasks.schedule | schedules 테이블 | 없음 | **추가** |
| 동시 실행 | Celery max 20 | workers × devices | **Agent 단위 max 20** |

### 1.2 결론

- **FastAPI, Celery, Redis 절대 도입 금지** (project-conventions.mdc)
- 스펙의 **비즈니스 요구사항**(채널/영상 등록, 태스크 유형, 스케줄)은 **기존 스택 위에** 구현
- `channels`, `videos`, `schedules` 테이블 추가 → `tasks` 테이블 확장

---

## 2. Phase 오케스트레이션

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        PLANNER (Ultrawork)                                │
│  각 Phase: 계획 → Ultrapilot 구현 → UltraQA 테스트 → Review → 다음 Phase  │
└─────────────────────────────────────────────────────────────────────────┘

Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5 ──► Phase 6
   │            │            │            │            │            │
   └── Review ──┴── Review ──┴── Review ──┴── Review ──┴── Review ──┘
       (충돌 시 Plan 작성 후 다음 Phase 진행)
```

---

## 3. Phase 1: 기반 설정 및 DB 스키마 확장

### 3.1 목표

- 기존 디렉토리 구조 준수
- `channels`, `videos`, `schedules` 테이블 추가
- `tasks` 테이블 확장 (video_id, channel_id, task_type 등)
- 환경 변수 정리

### 3.2 작업 항목 (Ultrapilot)

| # | 작업 | 파일/위치 |
|---|------|-----------|
| 1 | `channels`, `videos`, `schedules` 마이그레이션 | `supabase/migrations/00002_channels_videos_schedules.sql` |
| 2 | `tasks` 테이블 확장 (video_id, channel_id, task_type) | 동일 마이그레이션 |
| 3 | `.env.example` 업데이트 (YOUTUBE_API_KEY 등) | `.env.example` |
| 4 | `docs/ENV.md` 업데이트 | `docs/ENV.md` |
| 5 | `ARCHITECTURE.md`에 channels/videos/schedules 반영 | `ARCHITECTURE.md` |

### 3.3 UltraQA 체크리스트

- [ ] Supabase 마이그레이션 적용 성공
- [ ] `tasks` 테이블에 `video_id`, `channel_id` 컬럼 존재
- [ ] `channels`, `videos`, `schedules` 테이블 생성 확인
- [ ] `npm run build` 성공

### 3.4 Review 포인트

- 기존 `tasks` 스키마와의 호환성: `preset_id` 유지, `video_id`/`channel_id` nullable
- 기존 Agent 코드와의 충돌 여부 확인

---

## 4. Phase 2: 채널/영상 관리

### 4.1 목표

- YouTube Data API v3 연동 (채널/영상 정보 수집)
- 채널 CRUD API + 프론트엔드
- 영상 CRUD API + 프론트엔드
- 채널 등록 시 자동 정보 수집

### 4.2 작업 항목 (Ultrapilot)

| # | 작업 | 파일/위치 |
|---|------|-----------|
| 1 | YouTube API 서비스 | `lib/youtube/` 또는 API Route 내부 |
| 2 | 채널 API: POST, GET, PUT, DELETE, sync | `app/api/channels/route.ts`, `[id]/route.ts` |
| 3 | 영상 API: POST, GET, DELETE | `app/api/videos/route.ts`, `[id]/route.ts` |
| 4 | 채널 등록 폼 (URL 입력 → 자동 수집) | `components/channels-page.tsx` (실제 API 연동) |
| 5 | 영상 목록 + 수동 등록 | `components/channels-page.tsx` 내 Content 영역 |

### 4.3 UltraQA 체크리스트

- [ ] 채널 URL 입력 → YouTube API로 정보 수집 → DB 저장
- [ ] 채널 목록 조회 (목록, 상세)
- [ ] 영상 수동 등록 (URL)
- [ ] 영상 목록 필터 (channel_id, status)

### 4.4 Review 포인트

- `SUPABASE_SERVICE_ROLE_KEY`는 API Route에서만 사용
- YouTube API 쿼터 관리 (일일 10,000 유닛)

---

## 5. Phase 3: 태스크 시스템

### 5.1 목표

- 태스크 생성/조회 API (video 기반)
- Agent → Xiaowei 연동 (task_executor 완성)
- task_type: watch_video | subscribe | like | comment 매핑
- 동시 실행 제어 (노드당 max 20)

### 5.2 작업 항목 (Ultrapilot)

| # | 작업 | 파일/위치 |
|---|------|-----------|
| 1 | 태스크 API: POST, GET, cancel, retry | `app/api/tasks/route.ts`, `[id]/route.ts` |
| 2 | `tasks` payload에 video_url, channel_url 등 포함 | `lib/types.ts` 확장 |
| 3 | Agent: Supabase Realtime 구독 (tasks) | `agent/supabase-sync.js` |
| 4 | Agent: Xiaowei WebSocket 클라이언트 | `agent/xiaowei-client.js` |
| 5 | Agent: task_executor (preset/script 매핑) | `agent/task-executor.js` |
| 6 | `presets`에 watch_video, subscribe 등 기본 프리셋 | 시드 또는 마이그레이션 |

### 5.3 UltraQA 체크리스트

- [ ] POST /api/tasks → Supabase tasks INSERT
- [ ] Agent가 pending tasks 감지 → Xiaowei 호출
- [ ] task_logs에 실행 로그 저장
- [ ] 태스크 상태: pending → running → completed/failed

### 5.4 Review 포인트

- 기존 `tasks` (preset_id 기반) vs 신규 (video_id 기반) 통합
- Xiaowei API 프로토콜 상세 확인

---

## 6. Phase 4: 스케줄링 & 모니터링

### 6.1 목표

- schedules CRUD API
- 주기적 채널 모니터링 (Vercel Cron 또는 Edge Function)
- on_upload 트리거: 새 영상 감지 시 자동 태스크 생성

### 6.2 작업 항목 (Ultrapilot)

| # | 작업 | 파일/위치 |
|---|------|-----------|
| 1 | 스케줄 API: POST, GET, PUT, DELETE, toggle | `app/api/schedules/route.ts` |
| 2 | 채널 모니터링 크론 (Vercel Cron) | `app/api/cron/monitor-channels/route.ts` |
| 3 | 새 영상 감지 → videos INSERT → schedules에 따라 tasks 생성 | cron 내부 로직 |
| 4 | 스케줄 관리 UI | `components/schedules-page.tsx` (신규 또는 통합) |

### 6.3 UltraQA 체크리스트

- [ ] 스케줄 CRUD 동작
- [ ] 크론 호출 시 채널 최신 영상 조회
- [ ] 새 영상 감지 → tasks 자동 생성

### 6.4 Review 포인트

- Vercel Cron 제한 (Hobby: 일 1회 등) → 대안: Supabase Edge Function + pg_cron

---

## 7. Phase 5: 대시보드 & 실시간

### 7.1 목표

- 대시보드 통계 API
- SSE 로그 스트리밍 (선택)
- Supabase Realtime 구독 (tasks, devices)
- 실시간 UI: 디바이스 그리드, 태스크 진행, 로그

### 7.2 작업 항목 (Ultrapilot)

| # | 작업 | 파일/위치 |
|---|------|-----------|
| 1 | GET /api/stats (채널 수, 대기 태스크, 디바이스 등) | `app/api/stats/route.ts` |
| 2 | GET /api/logs/stream (SSE, 선택) | `app/api/logs/stream/route.ts` |
| 3 | useRealtimeTable 훅 (tasks, devices) | `hooks/use-realtime-table.ts` |
| 4 | 대시보드 StatsCards 실데이터 연동 | `components/dashboard/` (신규) |
| 5 | 디바이스 그리드 Realtime | `components/devices-page.tsx` |
| 6 | 태스크 진행 Realtime | `components/tasks-page.tsx` |

### 7.3 UltraQA 체크리스트

- [ ] 대시보드 통계 카드 실데이터 표시
- [ ] tasks 변경 시 UI 자동 업데이트
- [ ] devices 변경 시 UI 자동 업데이트

### 7.4 Review 포인트

- Mock → Real 전환 시 컴포넌트 충돌 여부

---

## 8. Phase 6: 안정화

### 8.1 목표

- 에러 핸들링 + 재시도 로직
- Agent 소켓 재연결 (exponential backoff)
- 로그 정리 (retention policy, 선택)
- E2E 또는 통합 테스트 보강

### 8.2 작업 항목 (Ultrapilot)

| # | 작업 | 파일/위치 |
|---|------|-----------|
| 1 | API 에러 핸들링 일원화 | `lib/api-error.ts` |
| 2 | Agent Xiaowei 재연결 로직 | `agent/xiaowei-client.js` |
| 3 | 태스크 재시도 API | `app/api/tasks/[id]/retry/route.ts` |
| 4 | UltraQA 통합 테스트 스크립트 | `tests/` (Playwright 또는 API 테스트) |

### 8.3 UltraQA 체크리스트

- [ ] API 4xx/5xx 적절한 응답
- [ ] Agent 재연결 시 태스크 복구
- [ ] 전체 플로우 E2E (채널 등록 → 영상 → 태스크 → 완료)

---

## 9. Phase별 실행 순서 (Ultrapilot)

```
Phase 1 완료 → UltraQA → Review (충돌 있으면 Plan 보완) → Phase 2
Phase 2 완료 → UltraQA → Review → Phase 3
...
Phase 6 완료 → UltraQA → 최종 Review
```

---

## 10. 마이그레이션 스키마 (Phase 1 참조)

```sql
-- 00002_channels_videos_schedules.sql

-- 채널
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  youtube_channel_id VARCHAR(50) UNIQUE NOT NULL,
  channel_name VARCHAR(255) NOT NULL,
  channel_url TEXT NOT NULL,
  thumbnail_url TEXT,
  subscriber_count BIGINT DEFAULT 0,
  video_count INT DEFAULT 0,
  api_key_encrypted TEXT,
  monitoring_enabled BOOLEAN DEFAULT true,
  monitoring_interval_minutes INT DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 영상
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  youtube_video_id VARCHAR(20) UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  duration_seconds INT,
  view_count BIGINT DEFAULT 0,
  like_count BIGINT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'detected',
  auto_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- tasks 확장 (기존 tasks에 컬럼 추가)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS video_id UUID REFERENCES videos(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES channels(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(30);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS device_count INT DEFAULT 20;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS max_retries INT DEFAULT 3;

-- 스케줄
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES channels(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  task_type VARCHAR(30) NOT NULL,
  trigger_type VARCHAR(20) NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  device_count INT DEFAULT 20,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_videos_channel ON videos(channel_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_tasks_video ON tasks(video_id);
CREATE INDEX idx_tasks_channel ON tasks(channel_id);
CREATE INDEX idx_schedules_channel ON schedules(channel_id);
```

---

## 11. API 라우트 목록 (최종)

| Method | Path | Phase |
|--------|------|-------|
| GET | /api/health | 기존 |
| GET | /api/stats | Phase 5 |
| POST/GET | /api/channels | Phase 2 |
| GET/PUT/DELETE | /api/channels/[id] | Phase 2 |
| POST | /api/channels/[id]/sync | Phase 2 |
| POST/GET | /api/videos | Phase 2 |
| GET/DELETE | /api/videos/[id] | Phase 2 |
| POST/GET | /api/tasks | Phase 3 |
| GET/PUT | /api/tasks/[id] | Phase 3 |
| PUT | /api/tasks/[id]/cancel | Phase 3 |
| PUT | /api/tasks/[id]/retry | Phase 6 |
| GET | /api/tasks/[id]/logs | Phase 3 |
| GET | /api/logs | Phase 5 |
| GET | /api/logs/stream | Phase 5 |
| POST/GET | /api/schedules | Phase 4 |
| PUT/DELETE | /api/schedules/[id] | Phase 4 |
| PUT | /api/schedules/[id]/toggle | Phase 4 |
| GET | /api/devices | 기존 또는 확장 |
| GET | /api/cron/monitor-channels | Phase 4 |

---

*이 문서는 Planner가 Ultrawork/Ultrapilot로 순차 구현 시 참조합니다. 각 Phase 완료 후 UltraQA로 기능 테스트를 수행하고, 충돌 시 Review를 통해 다음 Phase Plan을 보완합니다.*
