-- Fix RPC functions to match agent call signatures
--
-- Fixes:
-- 1. claim_task_devices_for_pc: used wrong column `worker_id` → fix to `pc_id`
-- 2. complete_task_device: agent calls with p_task_device_id (no runner_pc_id)
-- 3. fail_or_retry_task_device: agent calls with p_task_device_id + p_error

-- ============================================================
-- 1. claim_task_devices_for_pc (pc_id fix)
-- ============================================================
-- Drop old by-name version with wrong worker_id column
DROP FUNCTION IF EXISTS claim_task_devices_for_pc(text, integer);
DROP FUNCTION IF EXISTS claim_task_devices_for_pc(uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.claim_task_devices_for_pc(
  runner_pc_name TEXT,
  max_to_claim   INTEGER DEFAULT 1,
  lease_minutes  INTEGER DEFAULT 5
)
RETURNS SETOF public.task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pc_uuid UUID;
BEGIN
  -- Resolve pc_number → UUID
  SELECT id INTO _pc_uuid FROM pcs WHERE pc_number = runner_pc_name LIMIT 1;
  IF _pc_uuid IS NULL THEN
    RAISE WARNING 'claim_task_devices_for_pc: PC not found: %', runner_pc_name;
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT td.id
    FROM task_devices td
    WHERE td.pc_id = _pc_uuid
      AND td.status = 'pending'
      AND (td.lease_expires_at IS NULL OR td.lease_expires_at < now())
    ORDER BY td.created_at ASC
    LIMIT max_to_claim
    FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE task_devices td
    SET status           = 'running',
        claimed_by_pc_id = _pc_uuid,
        lease_expires_at = now() + make_interval(mins => lease_minutes),
        started_at       = COALESCE(td.started_at, now()),
        attempt          = td.attempt + 1,
        updated_at       = now()
    WHERE td.id IN (SELECT id FROM candidates)
    RETURNING td.*
  )
  SELECT * FROM updated;
END;
$$;

COMMENT ON FUNCTION claim_task_devices_for_pc(TEXT, INTEGER, INTEGER) IS
  'Atomically claim pending task_devices for a PC by pc_number. Uses FOR UPDATE SKIP LOCKED.';

-- ============================================================
-- 2. complete_task_device (p_task_device_id param name)
-- ============================================================
-- Drop old overloads
DROP FUNCTION IF EXISTS complete_task_device(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS complete_task_device(uuid);

CREATE OR REPLACE FUNCTION public.complete_task_device(
  p_task_device_id UUID,
  p_result         JSONB DEFAULT '{}'::JSONB
)
RETURNS public.task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.task_devices;
BEGIN
  UPDATE task_devices td
  SET status       = 'completed',
      result       = COALESCE(p_result, '{}'::JSONB),
      completed_at = now(),
      lease_expires_at = NULL,
      updated_at   = now()
  WHERE td.id = p_task_device_id
    AND td.status = 'running'
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

COMMENT ON FUNCTION complete_task_device(UUID, JSONB) IS
  'Mark a task_device as completed. Call after successful agent execution.';

-- ============================================================
-- 3. fail_or_retry_task_device (p_task_device_id + p_error param names)
-- ============================================================
-- Drop old overloads
DROP FUNCTION IF EXISTS fail_or_retry_task_device(uuid, uuid, text, integer);
DROP FUNCTION IF EXISTS fail_or_retry_task_device(uuid, text);

CREATE OR REPLACE FUNCTION public.fail_or_retry_task_device(
  p_task_device_id UUID,
  p_error          TEXT DEFAULT NULL
)
RETURNS public.task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.task_devices;
BEGIN
  UPDATE task_devices td
  SET error            = p_error,
      lease_expires_at = NULL,
      updated_at       = now(),
      status           = CASE
                           WHEN td.attempt < td.max_attempts THEN 'pending'
                           ELSE 'failed'
                         END,
      completed_at     = CASE
                           WHEN td.attempt < td.max_attempts THEN NULL
                           ELSE now()
                         END
  WHERE td.id = p_task_device_id
    AND td.status = 'running'
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

COMMENT ON FUNCTION fail_or_retry_task_device(UUID, TEXT) IS
  'Mark a task_device as failed or reset to pending for retry based on attempt count.';
