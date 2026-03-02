-- Enforce global ordering policy:
-- 1) oldest event first (created_at ASC)
-- 2) if same cycle/time, Korean title order via order_key ASC

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
  ORDER BY
    tq.created_at ASC,
    tq.discovered_run_id ASC NULLS FIRST,
    tq.order_key ASC NULLS FIRST,
    tq.id ASC
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
  'Atomically claim one queued item: oldest first, then same-cycle title order (order_key).';
