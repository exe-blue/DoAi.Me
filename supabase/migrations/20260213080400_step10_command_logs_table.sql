-- STEP 10: Command logs table for ADB console
-- Run in Supabase SQL Editor

-- 1. Create command_logs table
CREATE TABLE IF NOT EXISTS command_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'all',  -- 'single' | 'group' | 'all'
  target_ids UUID[],                         -- array of device UUIDs targeted
  target_serials TEXT[],                     -- array of device serials (for agent use)
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | running | completed | failed
  results JSONB,                             -- [{ device_serial, success, output, error, duration_ms }]
  initiated_by TEXT DEFAULT 'dashboard',     -- 'dashboard' | 'agent' | 'system'
  worker_id UUID,                            -- which worker executed this
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 2. Index for recent commands listing
CREATE INDEX IF NOT EXISTS idx_command_logs_created ON command_logs(created_at DESC);

-- 3. Index for status filtering
CREATE INDEX IF NOT EXISTS idx_command_logs_status ON command_logs(status);

-- 4. Enable Realtime on command_logs (agent subscribes to INSERT events with status='pending')
ALTER PUBLICATION supabase_realtime ADD TABLE command_logs;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'command_logs'
ORDER BY ordinal_position;
