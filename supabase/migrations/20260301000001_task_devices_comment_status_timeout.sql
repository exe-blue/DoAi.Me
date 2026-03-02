-- Architecture vulnerability fix: task_devices comment_status + timeout_at (Phase 0.2, 0.3, 5.2)

-- 1) comment_status for async comment generation + agent fallback
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_devices' AND column_name = 'comment_status') THEN
    ALTER TABLE task_devices ADD COLUMN comment_status TEXT DEFAULT 'pending'
      CHECK (comment_status IN ('pending', 'ready', 'fallback'));
    COMMENT ON COLUMN task_devices.comment_status IS 'pending=not yet generated; ready=pre-generated; fallback=agent generated';
  END IF;
END $$;

-- 2) timeout_at for per-row dynamic timeout (watch_seconds + buffer)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_devices' AND column_name = 'timeout_at') THEN
    ALTER TABLE task_devices ADD COLUMN timeout_at TIMESTAMPTZ;
    COMMENT ON COLUMN task_devices.timeout_at IS 'Row-level deadline; when set, timeout job uses this instead of started_at+20min';
  END IF;
END $$;

-- 3) Timeout function: prefer timeout_at when set, else started_at + 20 min
CREATE OR REPLACE FUNCTION public.fn_timeout_tasks_and_task_devices()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tasks: pending/running > 30 min → failed
  UPDATE tasks
  SET status = 'failed',
      error = 'Task timeout: exceeded 30 minutes',
      completed_at = coalesce(completed_at, now())
  WHERE status IN ('pending', 'running')
    AND (started_at IS NOT NULL AND started_at < now() - INTERVAL '30 minutes'
         OR started_at IS NULL AND created_at < now() - INTERVAL '30 minutes');

  -- Task_devices: use timeout_at when set, else started_at + 20 min
  UPDATE task_devices
  SET status = 'failed',
      error = 'Task device timeout: exceeded 20 minutes',
      completed_at = coalesce(completed_at, now())
  WHERE status = 'running'
    AND (
      (timeout_at IS NOT NULL AND timeout_at < now())
      OR (timeout_at IS NULL AND started_at IS NOT NULL AND started_at < now() - INTERVAL '20 minutes')
    );
END;
$$;

COMMENT ON FUNCTION public.fn_timeout_tasks_and_task_devices() IS
  'Mark timed-out tasks (30 min) and task_devices (timeout_at or 20 min). Prefers task_devices.timeout_at when set.';
