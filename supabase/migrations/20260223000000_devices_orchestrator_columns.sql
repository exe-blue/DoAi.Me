-- Devices orchestrator columns (task_status, watch_progress, etc.)
-- Add if not already present from dashboard_summary / step6–step7 migrations.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS task_status TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS current_assignment_id UUID;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS current_video_title TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS watch_progress INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS consecutive_errors INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS daily_watch_count INT DEFAULT 0;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS daily_watch_seconds INT DEFAULT 0;
