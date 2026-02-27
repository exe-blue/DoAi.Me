-- Change claim_task_devices_for_pc to accept pc_number name instead of UUID
-- Joins pcs table internally to resolve UUID for worker_id FK

-- Drop old UUID-based overload if it exists
DROP FUNCTION IF EXISTS claim_task_devices_for_pc(uuid, integer, integer);

CREATE OR REPLACE FUNCTION claim_task_devices_for_pc(
  runner_pc_name TEXT,
  max_to_claim   INT DEFAULT 1
)
RETURNS SETOF task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pc_uuid UUID;
  _row     task_devices%ROWTYPE;
  _claimed INT := 0;
BEGIN
  -- Resolve pc_number → UUID
  SELECT id INTO _pc_uuid FROM pcs WHERE pc_number = runner_pc_name LIMIT 1;
  IF _pc_uuid IS NULL THEN
    RAISE EXCEPTION 'PC not found: %', runner_pc_name;
  END IF;

  LOOP
    EXIT WHEN _claimed >= max_to_claim;

    SELECT * INTO _row
    FROM task_devices
    WHERE status = 'pending'
      AND (worker_id = _pc_uuid OR worker_id IS NULL)
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    EXIT WHEN NOT FOUND;

    UPDATE task_devices
    SET status     = 'running',
        worker_id  = _pc_uuid,
        started_at = now()
    WHERE id = _row.id;

    RETURN QUERY SELECT * FROM task_devices WHERE id = _row.id;
    _claimed := _claimed + 1;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION claim_task_devices_for_pc(TEXT, INT) IS
  'Claim pending task_devices for a PC identified by pc_number name (not UUID). Resolves UUID internally.';
