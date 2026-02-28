-- Architecture vulnerability fix: task_queue columns + atomic dequeue (Phase 0.1, 2.1, 9)
-- Adds: video_id, discovered_run_id, order_key, processing_started_at
-- Adds: RPC dequeue_task_queue_item() for FOR UPDATE SKIP LOCKED dequeue

-- 1) task_queue columns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_queue' AND column_name = 'video_id') THEN
    ALTER TABLE task_queue ADD COLUMN video_id TEXT;
    COMMENT ON COLUMN task_queue.video_id IS 'YouTube video ID; used for idempotent enqueue (ON CONFLICT)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_queue' AND column_name = 'discovered_run_id') THEN
    ALTER TABLE task_queue ADD COLUMN discovered_run_id UUID;
    COMMENT ON COLUMN task_queue.discovered_run_id IS 'Sync run bucket; same cycle = same id for ORDER BY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_queue' AND column_name = 'order_key') THEN
    ALTER TABLE task_queue ADD COLUMN order_key TEXT;
    COMMENT ON COLUMN task_queue.order_key IS 'Normalized title for stable sort (e.g. 가나다)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'task_queue' AND column_name = 'processing_started_at') THEN
    ALTER TABLE task_queue ADD COLUMN processing_started_at TIMESTAMPTZ;
    COMMENT ON COLUMN task_queue.processing_started_at IS 'Set when item is atomically claimed for dispatch';
  END IF;
END $$;

-- 2) Unique constraint: one queued row per video_id (idempotent enqueue)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.task_queue'::regclass AND conname = 'uq_task_queue_video_queued'
  ) THEN
    CREATE UNIQUE INDEX uq_task_queue_video_queued
      ON task_queue (video_id)
      WHERE status = 'queued' AND video_id IS NOT NULL;
  END IF;
EXCEPTION WHEN unique_violation THEN NULL;
END $$;

-- 3) Atomic dequeue RPC: claim one queued row and return it
CREATE OR REPLACE FUNCTION public.dequeue_task_queue_item()
RETURNS SETOF public.task_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  SELECT tq.id INTO _id
  FROM task_queue tq
  WHERE tq.status = 'queued'
  ORDER BY tq.discovered_run_id ASC NULLS FIRST, tq.order_key ASC NULLS FIRST, tq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE task_queue
  SET status = 'processing',
      processing_started_at = now()
  WHERE id = _id
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.dequeue_task_queue_item() IS
  'Atomically claim one queued task_queue row (FOR UPDATE SKIP LOCKED). Caller then creates task and marks dispatched.';
