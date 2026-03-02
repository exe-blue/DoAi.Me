-- STEP 11: Add missing columns to channels and videos for content management

-- channels: add category and notes
ALTER TABLE channels ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS notes TEXT;

-- videos: add youtube_url, priority, play_count, is_active
ALTER TABLE videos ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS play_count INTEGER DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Indexes for video queries
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_active ON videos(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_videos_priority ON videos(priority DESC) WHERE is_active = true;

-- Backfill youtube_url from youtube_video_id for existing videos
UPDATE videos
SET youtube_url = 'https://www.youtube.com/watch?v=' || youtube_video_id
WHERE youtube_url IS NULL AND youtube_video_id IS NOT NULL;
