-- DoAi.Me v2.1 - YouTube Agent Farm Extension
-- channels, videos, schedules 테이블 및 tasks 확장

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

-- 인덱스
CREATE INDEX idx_videos_channel ON videos(channel_id);
CREATE INDEX idx_videos_status ON videos(status);
CREATE INDEX idx_tasks_video ON tasks(video_id);
CREATE INDEX idx_tasks_channel ON tasks(channel_id);
CREATE INDEX idx_schedules_channel ON schedules(channel_id);
