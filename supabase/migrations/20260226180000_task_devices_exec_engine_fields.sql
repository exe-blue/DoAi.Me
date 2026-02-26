-- task_devices exec engine: claim/lease and last_error for SSOT runner
-- Status flow: queued -> running -> completed | failed (retry keeps queued)

-- 1. Who is running this row (PC that claimed it)
ALTER TABLE task_devices ADD COLUMN IF NOT EXISTS claimed_by_pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL;
COMMENT ON COLUMN task_devices.claimed_by_pc_id IS 'PC that claimed this row for execution (lease holder)';

-- 2. Lease expiry so stuck runners release
ALTER TABLE task_devices ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
COMMENT ON COLUMN task_devices.lease_expires_at IS 'Lease expiry; runner must heartbeat to extend';

-- 3. Last error timestamp for retry/backoff
ALTER TABLE task_devices ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
COMMENT ON COLUMN task_devices.last_error_at IS 'When the last error was recorded (for retry backoff)';

-- 4. Ensure retry_count has default for claim condition
ALTER TABLE task_devices ALTER COLUMN retry_count SET DEFAULT 0;

-- 5. Index for claim query: queued, pc_id, retry_count < 3, lease/claimed
CREATE INDEX IF NOT EXISTS idx_task_devices_claim
  ON task_devices(pc_id, status)
  WHERE status IN ('queued', 'pending') AND (retry_count IS NULL OR retry_count < 3);

CREATE INDEX IF NOT EXISTS idx_task_devices_lease
  ON task_devices(lease_expires_at)
  WHERE lease_expires_at IS NOT NULL;

-- 6. Atomic claim: take up to p_limit queued rows for this PC, one per device (no concurrent run per device)
CREATE OR REPLACE FUNCTION claim_next_task_devices(p_pc_id UUID, p_limit INT DEFAULT 1)
RETURNS SETOF task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row task_devices%ROWTYPE;
  _lease_until TIMESTAMPTZ := now() + interval '5 minutes';
BEGIN
  FOR _row IN
    SELECT td.*
    FROM task_devices td
    WHERE td.pc_id = p_pc_id
      AND td.status IN ('queued', 'pending')
      AND (td.retry_count IS NULL OR td.retry_count < 3)
      AND NOT EXISTS (
        SELECT 1 FROM task_devices r
        WHERE r.pc_id = td.pc_id
          AND r.device_serial = td.device_serial
          AND r.status = 'running'
          AND r.id <> td.id
      )
    ORDER BY td.created_at ASC
    LIMIT p_limit
    FOR UPDATE OF td SKIP LOCKED
  LOOP
    UPDATE task_devices
    SET status = 'running',
        claimed_by_pc_id = p_pc_id,
        lease_expires_at = _lease_until,
        started_at = coalesce(started_at, now())
    WHERE id = _row.id;

    SELECT * INTO _row FROM task_devices WHERE id = _row.id;
    RETURN NEXT _row;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION claim_next_task_devices(UUID, INT) IS
  'Atomically claim up to p_limit queued task_devices for p_pc_id; one running per (pc_id, device_serial). Lease 5min.';
