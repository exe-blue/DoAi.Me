# ADR-002: Channel/Video Management System

**Status**: Accepted
**Date**: 2026-02-13 ~ 2026-02-15
**Deciders**: Development Team
**Related Commits**: `998f2c2`, `682f6e3`

---

## Context

YouTube Agent Farm 시스템에서 채널과 영상을 효율적으로 관리하고, 새로운 영상이 업로드될 때 자동으로 태스크를 생성해야 합니다.

기존 v2.1 아키텍처에는 `channels`, `videos`, `schedules` 테이블이 없었으며, 수동으로 영상 URL을 입력해야 했습니다.

## Decision

### 1. 데이터베이스 스키마 확장

```sql
-- channels 테이블
CREATE TABLE channels (
  id UUID PRIMARY KEY,
  channel_id VARCHAR(50) UNIQUE NOT NULL,
  channel_handle VARCHAR(100),
  channel_name VARCHAR(255) NOT NULL,
  thumbnail_url TEXT,
  subscriber_count BIGINT,
  monitoring_enabled BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ
);

-- videos 테이블
CREATE TABLE videos (
  id UUID PRIMARY KEY,
  video_id VARCHAR(20) UNIQUE NOT NULL,
  channel_id UUID REFERENCES channels(id),
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  published_at TIMESTAMPTZ,
  duration INT,
  view_count BIGINT,
  status VARCHAR(20) DEFAULT 'detected',
  task_created BOOLEAN DEFAULT false
);

-- schedules 테이블
CREATE TABLE schedules (
  id UUID PRIMARY KEY,
  channel_id UUID REFERENCES channels(id),
  trigger_type VARCHAR(20), -- on_upload | interval | cron
  task_types TEXT[],
  enabled BOOLEAN DEFAULT true,
  interval_minutes INT,
  cron_expression VARCHAR(100)
);
```

### 2. YouTube Data API v3 연동

- `lib/youtube.ts`: 채널 핸들 해석, 최신 영상 조회
- 일일 API 쿼터 관리 (10,000 유닛)

### 3. API Routes

| Method | Path | 설명 |
|--------|------|------|
| GET/POST | `/api/channels` | 채널 목록/등록 |
| GET/POST | `/api/youtube/channels` | YouTube API로 채널 정보 조회 |
| GET | `/api/youtube/videos` | 채널별 최신 영상 조회 |
| GET | `/api/youtube/sync` | 전체 채널 동기화 |

### 4. 채널 등록 플로우

```
[1] 사용자가 채널 핸들 입력 (@channel_handle)
[2] YouTube API로 채널 ID, 이름, 썸네일 조회
[3] channels 테이블에 저장
[4] 최신 영상 자동 수집 → videos 테이블 저장
```

## Consequences

### Positive

- 채널 모니터링 자동화
- 새 영상 업로드 시 자동 태스크 생성 가능
- 영상별 상태 추적 (detected → queued → completed)

### Negative

- YouTube API 쿼터 제한
- 채널 정보 동기화 지연 가능

## Implementation

- `app/api/channels/route.ts`
- `app/api/youtube/channels/route.ts`
- `app/api/youtube/videos/route.ts`
- `lib/youtube.ts`
- `lib/db/channels.ts`, `lib/db/videos.ts`
- `components/channels-page.tsx`

---

## References

- Commits: `998f2c2` (STEP 11), `682f6e3` (channel registration API)
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) - Phase 2
