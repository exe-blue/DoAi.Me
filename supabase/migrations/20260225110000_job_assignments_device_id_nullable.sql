-- E2E 파이프라인: 풀 방식 배정을 위해 device_id nullable
-- VideoDispatcher가 device_serial=null인 pending을 여러 개 만들고, Orchestrator가 claim 시 device 채움

ALTER TABLE job_assignments ALTER COLUMN device_id DROP NOT NULL;

COMMENT ON COLUMN job_assignments.device_id IS '선점 시 채움 (null = 아직 미선점)';

-- claim 시 device_id도 설정하도록 RPC 수정
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
  _device_id := (SELECT id FROM devices WHERE pc_id = p_pc_id AND serial_number = p_device_serial LIMIT 1);

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
