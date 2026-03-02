-- STEP 10: Add config column to task_devices for per-device video URLs

-- Add config jsonb column to store per-device configuration
-- Used for batch tasks to assign different videos to different devices
ALTER TABLE task_devices ADD COLUMN IF NOT EXISTS config JSONB;

-- Add comment
COMMENT ON COLUMN task_devices.config IS 'Per-device configuration (e.g., { video_url, video_id } for batch tasks)';
