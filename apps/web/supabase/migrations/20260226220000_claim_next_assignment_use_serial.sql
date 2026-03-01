-- Align claim_next_assignment with devices.serial (identity column)
CREATE OR REPLACE FUNCTION claim_next_assignment(p_pc_id UUID, p_device_serial TEXT)
RETURNS SETOF job_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row job_assignments%ROWTYPE;
  _device_id UUID;
BEGIN
  _device_id := (SELECT id FROM devices WHERE pc_id = p_pc_id AND serial = p_device_serial LIMIT 1);

  SELECT * INTO _row
  FROM job_assignments
  WHERE status = 'pending'
    AND (
      pc_id = p_pc_id
      OR (pc_id IS NULL AND device_id IN (SELECT id FROM devices WHERE pc_id = p_pc_id))
    )
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE job_assignments
  SET status = 'running',
      device_serial = p_device_serial,
      device_id = COALESCE(device_id, _device_id),
      started_at = now()
  WHERE id = _row.id;

  RETURN QUERY SELECT * FROM job_assignments WHERE id = _row.id;
END;
$$;
