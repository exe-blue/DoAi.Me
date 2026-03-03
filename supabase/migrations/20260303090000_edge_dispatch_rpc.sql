-- Edge Functions migration: move dispatch concurrency/atomicity into Postgres RPC

CREATE OR REPLACE FUNCTION public.claim_dispatchable_task_queue_item()
RETURNS SETOF public.task_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('claim_dispatchable_task_queue_item'));

  IF EXISTS (
    SELECT 1
    FROM public.tasks t
    WHERE t.status IN ('pending', 'running')
  ) THEN
    RETURN;
  END IF;

  SELECT tq.id INTO _id
  FROM public.task_queue tq
  WHERE tq.status = 'queued'
  ORDER BY tq.discovered_run_id ASC NULLS FIRST, tq.order_key ASC NULLS FIRST, tq.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.task_queue
  SET status = 'processing',
      processing_started_at = now()
  WHERE id = _id
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.claim_dispatchable_task_queue_item() IS
  'Atomically claims one queue row only when there are no active pending/running tasks.';
