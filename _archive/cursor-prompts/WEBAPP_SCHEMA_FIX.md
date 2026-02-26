# Web App DB 스키마 불일치 수정 지시서

## 실제 Supabase 테이블 스키마 (2026-02-22 확인)

### channels 테이블
```
id: text (PK) — YouTube Channel ID (e.g. "UCxxxxxxx")
name: text
handle: text (e.g. "@SUPERANT_AN")
profile_url: text
banner_url: text
thumbnail_url: text
subscriber_count: text
video_count: integer
total_views: integer
category: text
is_monitored: boolean (default false)
auto_collect: boolean (default false)
collect_interval_hours: integer (default 24)
last_collected_at: timestamp
last_video_check_at: timestamp
default_watch_duration_sec: integer (default 60)
default_prob_like: integer (default 0)
default_prob_comment: integer (default 0)
default_prob_subscribe: integer (default 0)
status: text (default 'active')
metadata: jsonb (default {})
created_at: timestamp
updated_at: timestamp
push_status: text (default 'none')
push_expires_at: timestamp
```

### videos 테이블
```
id: text (PK) — YouTube Video ID (e.g. "dQw4w9WgXcQ")
title: text
channel_id: text (FK → channels.id)
channel_name: text
thumbnail_url: text
duration_sec: integer
video_duration_sec: integer
search_keyword: text
target_views: integer
completed_views: integer
failed_views: integer
watch_duration_sec: integer
watch_duration_min_pct: integer
watch_duration_max_pct: integer
prob_like: integer
prob_comment: integer
prob_subscribe: integer
status: text ('active'|'paused'|'completed'|'archived')
priority: text ('urgent'|'high'|'normal'|'low')
tags: text[]
metadata: jsonb
last_scheduled_at: timestamp
created_at: timestamp
updated_at: timestamp
priority_enabled: boolean
priority_updated_at: timestamp
```

### jobs 테이블
```
id: uuid (PK, auto-generated)
title: text
keyword: text
video_title: text
duration_sec: integer
target_group: text
target_url: text
video_url: text
script_type: text
duration_min_pct: integer
duration_max_pct: integer
prob_like: integer
like_probability: integer
prob_comment: integer
prob_playlist: integer
base_reward: integer
is_active: boolean
total_assignments: integer
created_at: timestamp
updated_at: timestamp
```

### job_assignments 테이블
```
id: uuid (PK, auto-generated)
job_id: uuid (FK → jobs.id)
device_id: uuid (FK → devices.id)
device_serial: text
agent_id: uuid
status: text
progress_pct: integer
final_duration_sec: integer
watch_percentage: integer
did_like: boolean
did_comment: boolean
did_playlist: boolean
search_success: boolean
error_log: text
error_code: text
retry_count: integer
assigned_at: timestamp
created_at: timestamp
started_at: timestamp
completed_at: timestamp
```

## 수정 필요 파일 목록

### 1. lib/db/channels.ts
- `youtube_channel_id` → `id` (channels PK가 YouTube channel ID)
- `channel_name` → `name`
- `channel_url` → `profile_url`
- `monitoring_enabled` → `is_monitored`
- `monitoring_interval_minutes` → `collect_interval_hours`
- `onConflict: "youtube_channel_id"` → `onConflict: "id"`

### 2. lib/db/videos.ts
- `youtube_video_id` → `id` (videos PK가 YouTube video ID)
- `published_at` → 삭제 (컬럼 없음)
- `auto_detected` → 삭제 (컬럼 없음)
- `is_active` → 삭제 (컬럼 없음, status='active'로 대체)
- `youtube_url` → 삭제 (컬럼 없음)
- `duration_seconds` → `duration_sec`
- `onConflict: "youtube_video_id"` → `onConflict: "id"`

### 3. lib/supabase/types.ts
ChannelRow 인터페이스를 실제 DB에 맞게 수정:
```typescript
export interface ChannelRow {
  id: string; // YouTube Channel ID
  name: string;
  handle: string | null;
  profile_url: string | null;
  banner_url: string | null;
  thumbnail_url: string | null;
  subscriber_count: string | null;
  video_count: number;
  total_views: number;
  category: string | null;
  is_monitored: boolean;
  auto_collect: boolean;
  collect_interval_hours: number;
  last_collected_at: string | null;
  last_video_check_at: string | null;
  default_watch_duration_sec: number;
  default_prob_like: number;
  default_prob_comment: number;
  default_prob_subscribe: number;
  status: "active" | "paused" | "archived";
  metadata: Json;
  created_at: string;
  updated_at: string;
  push_status: "active" | "pending" | "expired" | "none";
  push_expires_at: string | null;
}
```

### 4. lib/mappers.ts
mapChannelRow, mapVideoRow 매핑 키 변경

### 5. app/api/youtube/sync/route.ts
- upsertChannel 호출 시 올바른 컬럼명 사용
- upsertVideo 호출 시 올바른 컬럼명 사용
- `published_at`, `auto_detected` 제거

### 6. app/api/youtube/register-channels/route.ts
— 이미 수정된 버전 제공됨 (올바른 컬럼 사용)

### 7. app/api/cron/sync-channels/route.ts
- upsertVideo 호출 시 올바른 컬럼명 사용

### 8. hooks/use-channel-sync.ts
- 응답 매핑 키 변경 (channel_name → name 등)

### 9. agent/video-dispatcher.js
- `videos` 쿼리: `status`, `target_views` 등은 실제 존재 ✓
- YouTube URL: `https://www.youtube.com/watch?v=${video.id}` (videos.id = YouTube video ID) ✓
- `duration_seconds` → `duration_sec` 또는 `watch_duration_sec`

## 핵심 원칙
channels.id = YouTube Channel ID (텍스트)
videos.id = YouTube Video ID (텍스트)
youtube_channel_id / youtube_video_id 컬럼은 존재하지 않음!