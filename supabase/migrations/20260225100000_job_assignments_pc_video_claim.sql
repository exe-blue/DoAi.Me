-- job_assignments: pc_id, video_id 추가 (Orchestrator claim 흐름용)
-- claim_next_assignment RPC: pending 1건 선점 후 device_serial 설정, 반환

ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS pc_id UUID REFERENCES pcs(id);
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS video_id TEXT;

COMMENT ON COLUMN job_assignments.pc_id IS '배정 대상 PC (claim_next_assignment에서 사용)';
COMMENT ON COLUMN job_assignments.video_id IS 'YouTube Video ID (videos.id)';

-- 인덱스: claim 시 pending + pc_id 조회
CREATE INDEX IF NOT EXISTS idx_job_assignments_pending_pc
  ON job_assignments (pc_id, status) WHERE status = 'pending';

-- RPC: 한 건 선점 후 running + device_serial 설정, 해당 행 반환
CREATE OR REPLACE FUNCTION claim_next_assignment(p_pc_id UUID, p_device_serial TEXT)
RETURNS SETOF job_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row job_assignments%ROWTYPE;
BEGIN
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
      started_at = now()
  WHERE id = _row.id;

  RETURN QUERY SELECT * FROM job_assignments WHERE id = _row.id;
END;
$$;

COMMENT ON FUNCTION claim_next_assignment(UUID, TEXT) IS 'Orchestrator: pending assignment 1건 선점, device_serial 설정 후 반환';
