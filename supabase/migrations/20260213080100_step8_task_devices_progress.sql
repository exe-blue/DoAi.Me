-- STEP 8: Add progress column to task_devices + index + retention job
-- Run in Supabase SQL Editor

-- 1. Add progress column (0-100 milestone tracking)
ALTER TABLE task_devices ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

-- 2. Ensure unique constraint on (task_id, device_serial)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_task_devices_task_device'
  ) THEN
    ALTER TABLE task_devices ADD CONSTRAINT uq_task_devices_task_device UNIQUE (task_id, device_serial);
  END IF;
END $$;

-- 3. Index for fast lookup by task_id (if not exists)
CREATE INDEX IF NOT EXISTS idx_task_devices_task ON task_devices(task_id);

-- 4. Index for progress queries
CREATE INDEX IF NOT EXISTS idx_task_devices_task_status ON task_devices(task_id, status);

-- 5. Add broadcast trigger for task_logs INSERT (batch-friendly)
-- The agent will call broadcast_to_channel() directly from code instead of a trigger,
-- since we're batching inserts and want to send one broadcast per batch, not per row.

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'task_devices' AND column_name = 'progress';
