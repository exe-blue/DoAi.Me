-- Task timeout 30 min; task_device timeout 20 min.
-- Run periodically (e.g. every 5 min) to mark timed-out rows.

CREATE OR REPLACE FUNCTION public.fn_timeout_tasks_and_task_devices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tasks: pending/running > 30 min → timeout/failed
  UPDATE tasks
  SET status = 'failed',
      error = 'Task timeout: exceeded 30 minutes',
      completed_at = now()
  WHERE status IN ('pending', 'running')
    AND (started_at IS NOT NULL AND started_at < now() - INTERVAL '30 minutes'
         OR started_at IS NULL AND created_at < now() - INTERVAL '30 minutes');

  -- Task_devices: running > 20 min → failed
  UPDATE task_devices
  SET status = 'failed',
      error = 'Task device timeout: exceeded 20 minutes',
      completed_at = coalesce(completed_at, now())
  WHERE status = 'running'
    AND started_at IS NOT NULL
    AND started_at < now() - INTERVAL '20 minutes';
END;
$$;

COMMENT ON FUNCTION public.fn_timeout_tasks_and_task_devices() IS
  'Mark tasks (30 min) and task_devices (20 min) as failed when exceeded. Call from cron or API.';

-- Schedule every 5 minutes (if pg_cron is available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('timeout-tasks-and-task-devices');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'timeout-tasks-and-task-devices',
      '*/5 * * * *',
      $$SELECT public.fn_timeout_tasks_and_task_devices();$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
