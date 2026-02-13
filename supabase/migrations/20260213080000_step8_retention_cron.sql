-- STEP 8: pg_cron retention jobs
-- Run in Supabase SQL Editor (requires pg_cron extension enabled)

-- Enable pg_cron if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Delete task_logs older than 7 days (daily at 03:00 UTC)
SELECT cron.schedule(
  'cleanup-task-logs-7d',
  '0 3 * * *',
  $$DELETE FROM task_logs WHERE created_at < NOW() - INTERVAL '7 days'$$
);

-- 2. Delete task_devices for tasks older than 30 days (daily at 03:15 UTC)
SELECT cron.schedule(
  'cleanup-task-devices-30d',
  '15 3 * * *',
  $$DELETE FROM task_devices WHERE created_at < NOW() - INTERVAL '30 days'$$
);

-- 3. Delete command_logs older than 30 days (daily at 03:30 UTC)
-- command_logs may not exist yet; wrapped in DO block
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'command_logs') THEN
    PERFORM cron.schedule(
      'cleanup-command-logs-30d',
      '30 3 * * *',
      'DELETE FROM command_logs WHERE created_at < NOW() - INTERVAL ''30 days'''
    );
  END IF;
END $$;

-- Verify scheduled jobs
SELECT jobid, schedule, command FROM cron.job ORDER BY jobid;
