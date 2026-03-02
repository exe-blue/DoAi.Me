-- claim_next_task_device RPC: pending task_device 1건 선점 후 device_serial/worker_id 설정, 반환
-- Replaces claim_next_assignment (which operated on job_assignments)

CREATE OR REPLACE FUNCTION claim_next_task_device(p_worker_id UUID, p_device_serial TEXT)
RETURNS SETOF task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row task_devices%ROWTYPE;
BEGIN
  SELECT * INTO _row
  FROM task_devices
  WHERE status = 'pending'
    AND (worker_id = p_worker_id OR worker_id IS NULL)
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE task_devices
  SET status = 'running',
      device_serial = p_device_serial,
      worker_id = p_worker_id,
      started_at = now()
  WHERE id = _row.id;

  RETURN QUERY SELECT * FROM task_devices WHERE id = _row.id;
END;
$$;

COMMENT ON FUNCTION claim_next_task_device(UUID, TEXT) IS 'Orchestrator: pending task_device 1건 선점, device_serial/worker_id 설정 후 반환';
