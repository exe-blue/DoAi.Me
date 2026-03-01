-- task_devices: 태스크-디바이스 할당/실행 엔진 SSOT
CREATE TABLE IF NOT EXISTS public.task_devices (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID         NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  pc_id            UUID         REFERENCES public.pcs(id),
  device_id        UUID         NOT NULL REFERENCES public.devices(id),
  status           TEXT         NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed', 'canceled')),
  priority         INT          NOT NULL DEFAULT 0,
  retry_count      INT          NOT NULL DEFAULT 0,
  max_retries      INT          NOT NULL DEFAULT 3,
  claimed_by_pc_id UUID,
  lease_expires_at TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  config           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  result           JSONB        DEFAULT '{}'::jsonb,
  error            TEXT,
  last_error_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (task_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_task_devices_task_id ON public.task_devices(task_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_pc_id ON public.task_devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_device_id ON public.task_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_queued
  ON public.task_devices(status, created_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_task_devices_running_lease
  ON public.task_devices(device_id, lease_expires_at)
  WHERE status = 'running';

COMMENT ON TABLE public.task_devices IS '태스크-디바이스 할당/실행 엔진. Claim/완료/실패는 RPC 사용.';

-- RPC: Claim queued task_devices for a PC (원자 처리)
CREATE OR REPLACE FUNCTION public.claim_task_devices_for_pc(
  runner_pc_id UUID,
  max_to_claim INT DEFAULT 10,
  lease_minutes INT DEFAULT 5
)
RETURNS SETOF public.task_devices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lease_interval INTERVAL := make_interval(mins => lease_minutes);
  _row public.task_devices%ROWTYPE;
  _limit INT := greatest(max_to_claim, 0);
BEGIN
  FOR _row IN
    SELECT td.*
    FROM public.task_devices td
    WHERE td.pc_id = runner_pc_id
      AND td.status = 'queued'
      AND td.retry_count < td.max_retries
      AND NOT EXISTS (
        SELECT 1
        FROM public.task_devices td2
        WHERE td2.device_id = td.device_id
          AND td2.status = 'running'
          AND coalesce(td2.lease_expires_at, now() - interval '1 day') > now()
      )
    ORDER BY td.priority DESC, td.created_at ASC
    LIMIT _limit
    FOR UPDATE OF td SKIP LOCKED
  LOOP
    UPDATE public.task_devices
    SET status = 'running',
        claimed_by_pc_id = runner_pc_id,
        lease_expires_at = now() + lease_interval,
        started_at = coalesce(started_at, now()),
        updated_at = now()
    WHERE id = _row.id;
    SELECT * INTO _row FROM public.task_devices WHERE id = _row.id;
    RETURN NEXT _row;
  END LOOP;
  RETURN;
END $$;

-- RPC: Lease 갱신
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
  updated_count INT;
BEGIN
  UPDATE public.task_devices
  SET lease_expires_at = now() + make_interval(mins => lease_minutes),
      updated_at = now()
  WHERE id = task_device_id
    AND status = 'running'
    AND claimed_by_pc_id = runner_pc_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END $$;

-- RPC: 완료 처리
CREATE OR REPLACE FUNCTION public.complete_task_device(
  task_device_id UUID,
  runner_pc_id UUID,
  result_json JSONB DEFAULT '{}'::jsonb
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
      result = coalesce(result, '{}'::jsonb) || coalesce(result_json, '{}'::jsonb),
      updated_at = now()
  WHERE id = task_device_id
    AND status = 'running'
    AND claimed_by_pc_id = runner_pc_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END $$;

-- RPC: 실패/재시도 처리
CREATE OR REPLACE FUNCTION public.fail_or_retry_task_device(
  task_device_id UUID,
  runner_pc_id UUID,
  error_text TEXT,
  retryable BOOLEAN DEFAULT true
)
RETURNS TABLE(final_status TEXT, retry_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_retry INT;
  cur_max INT;
BEGIN
  SELECT td.retry_count, td.max_retries
    INTO cur_retry, cur_max
  FROM public.task_devices td
  WHERE td.id = task_device_id
    AND td.status = 'running'
    AND td.claimed_by_pc_id = runner_pc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'no-op'::TEXT, NULL::INT;
    RETURN;
  END IF;

  IF retryable AND (cur_retry + 1) < cur_max THEN
    UPDATE public.task_devices
    SET status = 'queued',
        retry_count = cur_retry + 1,
        error = error_text,
        last_error_at = now(),
        lease_expires_at = NULL,
        claimed_by_pc_id = NULL,
        updated_at = now()
    WHERE id = task_device_id;

    RETURN QUERY SELECT 'queued'::TEXT, cur_retry + 1;
  ELSE
    UPDATE public.task_devices
    SET status = 'failed',
        retry_count = cur_retry + 1,
        error = error_text,
        last_error_at = now(),
        completed_at = now(),
        lease_expires_at = NULL,
        updated_at = now()
    WHERE id = task_device_id;

    RETURN QUERY SELECT 'failed'::TEXT, cur_retry + 1;
  END IF;
END $$;
