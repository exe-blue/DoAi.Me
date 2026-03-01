-- task_devices 실행 엔진 필드 보강 + 원자 Claim/Lease/Complete/Fail RPC
-- 기존 20260226180000에서 claimed_by_pc_id, lease_expires_at, last_error_at 추가됨.
-- 이 마이그레이션: 인덱스 보강 + claim_task_devices_for_pc 등 4개 RPC (devices 조인 기반).

-- 1) 실행 엔진 필드 (방어적 추가)
ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS claimed_by_pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL;
ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;

ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS retry_count INT;
ALTER TABLE public.task_devices ALTER COLUMN retry_count SET DEFAULT 0;

ALTER TABLE public.task_devices ALTER COLUMN status SET DEFAULT 'queued';

CREATE INDEX IF NOT EXISTS idx_task_devices_status ON public.task_devices(status);
CREATE INDEX IF NOT EXISTS idx_task_devices_lease ON public.task_devices(lease_expires_at);
CREATE INDEX IF NOT EXISTS idx_task_devices_claimed_by ON public.task_devices(claimed_by_pc_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='task_devices' AND column_name='device_id') THEN
    CREATE INDEX IF NOT EXISTS idx_task_devices_device_id ON public.task_devices(device_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='task_devices' AND column_name='device_serial') THEN
    CREATE INDEX IF NOT EXISTS idx_task_devices_device_serial ON public.task_devices(device_serial);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='task_devices' AND column_name='task_id') THEN
    CREATE INDEX IF NOT EXISTS idx_task_devices_task_id ON public.task_devices(task_id);
  END IF;
END $$;

-- 2) 원자 Claim RPC (devices 조인: pc_id 일치, device_serial로 디바이스당 1 running)
-- FOR UPDATE SKIP LOCKED는 CTE에서 불가하므로 루프로 행 단위 lock + update
DROP FUNCTION IF EXISTS public.claim_next_task_devices(UUID, INT);

CREATE OR REPLACE FUNCTION public.claim_task_devices_for_pc(
  runner_pc_id UUID,
  max_to_claim INT DEFAULT 10,
  lease_minutes INT DEFAULT 5,
  max_retries INT DEFAULT 3
)
RETURNS SETOF public.task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lease_interval INTERVAL := make_interval(mins => lease_minutes);
  _row public.task_devices%ROWTYPE;
  _limit INT := GREATEST(max_to_claim, 0);
BEGIN
  FOR _row IN
    SELECT td.*
    FROM public.task_devices td
    JOIN public.devices d ON d.serial = td.device_serial AND d.pc_id = runner_pc_id
    WHERE td.status IN ('queued', 'pending')
      AND COALESCE(td.retry_count, 0) < max_retries
      AND NOT EXISTS (
        SELECT 1 FROM public.task_devices td2
        WHERE td2.status = 'running'
          AND COALESCE(td2.lease_expires_at, now() - interval '1 day') > now()
          AND td2.device_serial = td.device_serial
      )
    ORDER BY td.created_at ASC
    LIMIT _limit
    FOR UPDATE OF td SKIP LOCKED
  LOOP
    UPDATE public.task_devices
    SET status = 'running',
        claimed_by_pc_id = runner_pc_id,
        lease_expires_at = now() + lease_interval,
        started_at = COALESCE(started_at, now())
    WHERE id = _row.id;

    SELECT * INTO _row FROM public.task_devices WHERE id = _row.id;
    RETURN NEXT _row;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.claim_task_devices_for_pc(UUID, INT, INT, INT) IS
  'Atomically claim up to max_to_claim queued task_devices for runner_pc_id (via devices join). One running per device. Lease lease_minutes.';

-- 3) Lease 갱신 RPC
CREATE OR REPLACE FUNCTION public.renew_task_device_lease(
  task_device_id UUID,
  runner_pc_id UUID,
  lease_minutes INT DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lease_interval INTERVAL := make_interval(mins => lease_minutes);
  updated_count INT;
BEGIN
  UPDATE public.task_devices
  SET lease_expires_at = now() + lease_interval
  WHERE id = task_device_id
    AND status = 'running'
    AND claimed_by_pc_id = runner_pc_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

-- 4) 완료 처리 RPC
CREATE OR REPLACE FUNCTION public.complete_task_device(
  task_device_id UUID,
  runner_pc_id UUID,
  result_json JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count INT;
BEGIN
  UPDATE public.task_devices
  SET status = 'completed',
      completed_at = now(),
      lease_expires_at = NULL,
      claimed_by_pc_id = NULL,
      result = result_json
  WHERE id = task_device_id
    AND status = 'running'
    AND claimed_by_pc_id = runner_pc_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

-- 5) 실패/재시도 처리 RPC
CREATE OR REPLACE FUNCTION public.fail_or_retry_task_device(
  task_device_id UUID,
  runner_pc_id UUID,
  error_text TEXT,
  retryable BOOLEAN DEFAULT true,
  max_retries INT DEFAULT 3
)
RETURNS TABLE(final_status TEXT, retry_count_out INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_retry INT;
BEGIN
  SELECT COALESCE(td.retry_count, 0)
    INTO current_retry
  FROM public.task_devices td
  WHERE td.id = task_device_id
    AND td.claimed_by_pc_id = runner_pc_id
    AND td.status = 'running'
  FOR UPDATE;

  IF NOT FOUND THEN
    final_status := 'no-op';
    retry_count_out := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF retryable AND (current_retry + 1 < max_retries) THEN
    UPDATE public.task_devices
    SET status = 'queued',
        retry_count = current_retry + 1,
        error = error_text,
        last_error_at = now(),
        lease_expires_at = NULL,
        claimed_by_pc_id = NULL
    WHERE id = task_device_id;

    final_status := 'queued';
    retry_count_out := current_retry + 1;
    RETURN NEXT;
  ELSE
    UPDATE public.task_devices
    SET status = 'failed',
        retry_count = current_retry + 1,
        error = error_text,
        last_error_at = now(),
        completed_at = now(),
        lease_expires_at = NULL,
        claimed_by_pc_id = NULL
    WHERE id = task_device_id;

    final_status := 'failed';
    retry_count_out := current_retry + 1;
    RETURN NEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.renew_task_device_lease(UUID, UUID, INT) IS 'Extend lease for running task_device (heartbeat).';
COMMENT ON FUNCTION public.complete_task_device(UUID, UUID, JSONB) IS 'Mark task_device completed and clear lease.';
COMMENT ON FUNCTION public.fail_or_retry_task_device(UUID, UUID, TEXT, BOOLEAN, INT) IS 'Fail or requeue for retry (retry_count < max_retries).';
