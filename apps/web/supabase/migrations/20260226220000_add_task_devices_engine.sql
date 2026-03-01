-- task_devices 실행 엔진: (A) 스키마+인덱스, (B) 원자 claim RPC, (C) lease/complete/fail-or-retry RPC, (D) devices.connection_id
-- 기존 task_devices(device_serial)가 있으면 device_id 등 보강; 없으면 신규 생성.

-- 0) devices.connection_id 추가 (실행 타겟용)
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS connection_id TEXT;
CREATE INDEX IF NOT EXISTS idx_devices_connection_id ON public.devices(connection_id);
CREATE INDEX IF NOT EXISTS idx_devices_pc_id ON public.devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON public.devices(serial);

-- 1) task_devices: 기존 테이블이 있으면 보강, 없으면 신규 생성
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_devices') THEN
    CREATE TABLE public.task_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
      pc_id UUID NOT NULL REFERENCES public.pcs(id) ON DELETE CASCADE,
      device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','running','completed','failed','canceled')),
      priority INT NOT NULL DEFAULT 0,
      retry_count INT NOT NULL DEFAULT 0,
      max_retries INT NOT NULL DEFAULT 3,
      claimed_by_pc_id UUID REFERENCES public.pcs(id) ON DELETE SET NULL,
      lease_expires_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      config JSONB NOT NULL DEFAULT '{}'::JSONB,
      result JSONB DEFAULT '{}'::JSONB,
      error TEXT,
      last_error_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT task_devices_unique_task_device UNIQUE (task_id, device_id)
    );
  ELSE
    -- 기존 테이블 보강: device_id, priority, max_retries, claimed_by_pc_id, lease_expires_at, last_error_at, updated_at
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS pc_id UUID REFERENCES public.pcs(id) ON DELETE CASCADE;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS max_retries INT NOT NULL DEFAULT 3;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS claimed_by_pc_id UUID REFERENCES public.pcs(id) ON DELETE SET NULL;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE public.task_devices ALTER COLUMN retry_count SET DEFAULT 0;
    -- pc_id 백필 (없을 때)
    UPDATE public.task_devices td
    SET pc_id = d.pc_id
    FROM public.devices d
    WHERE td.pc_id IS NULL AND td.device_serial IS NOT NULL AND d.serial = td.device_serial;
    -- device_id 백필: device_serial + pc_id로 devices 조인
    UPDATE public.task_devices td
    SET device_id = d.id
    FROM public.devices d
    WHERE td.device_id IS NULL
      AND td.device_serial IS NOT NULL
      AND d.serial = td.device_serial
      AND (td.pc_id = d.pc_id OR td.pc_id IS NULL);
  END IF;
END $$;

-- updated_at 트리거 (함수 없으면 무시)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'set_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_devices_set_updated_at') THEN
      CREATE TRIGGER trg_task_devices_set_updated_at
      BEFORE UPDATE ON public.task_devices
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  ELSIF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_devices_updated_at') THEN
      CREATE TRIGGER trg_task_devices_updated_at
      BEFORE UPDATE ON public.task_devices
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- 2) 인덱스
CREATE INDEX IF NOT EXISTS idx_task_devices_task_id ON public.task_devices(task_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_pc_id ON public.task_devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_device_id ON public.task_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_queued ON public.task_devices(status, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_task_devices_running_lease ON public.task_devices(device_id, lease_expires_at) WHERE status = 'running';

-- 3) 원자 Claim RPC (plpgsql: CTE 내 FOR UPDATE 미지원이므로 루프 사용)
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
  _limit INT := GREATEST(max_to_claim, 0);
BEGIN
  FOR _row IN
    SELECT td.*
    FROM public.task_devices td
    JOIN public.devices d ON d.id = td.device_id
    WHERE td.pc_id = runner_pc_id
      AND td.status IN ('queued', 'pending')
      AND COALESCE(td.retry_count, 0) < COALESCE(td.max_retries, 3)
      AND NOT EXISTS (
        SELECT 1 FROM public.task_devices td2
        WHERE td2.device_id = td.device_id
          AND td2.status = 'running'
          AND COALESCE(td2.lease_expires_at, now() - interval '1 day') > now()
      )
    ORDER BY COALESCE(td.priority, 0) DESC, td.created_at ASC
    LIMIT _limit
    FOR UPDATE OF td SKIP LOCKED
  LOOP
    UPDATE public.task_devices
    SET status = 'running',
        claimed_by_pc_id = runner_pc_id,
        lease_expires_at = now() + lease_interval,
        started_at = COALESCE(started_at, now()),
        updated_at = now()
    WHERE id = _row.id;
    SELECT * INTO _row FROM public.task_devices WHERE id = _row.id;
    RETURN NEXT _row;
  END LOOP;
  RETURN;
END;
$$;

-- 4) Lease 갱신 RPC
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

-- 5) 완료 처리 RPC
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
      result = COALESCE(result, '{}'::JSONB) || COALESCE(result_json, '{}'::JSONB),
      updated_at = now()
  WHERE id = task_device_id
    AND status = 'running'
    AND claimed_by_pc_id = runner_pc_id;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END $$;

-- 6) 실패/재시도 처리 RPC
CREATE OR REPLACE FUNCTION public.fail_or_retry_task_device(
  task_device_id UUID,
  runner_pc_id UUID,
  error_text TEXT,
  retryable BOOLEAN DEFAULT true
)
RETURNS TABLE(final_status TEXT, retry_count_out INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cur_retry INT;
  cur_max INT;
BEGIN
  SELECT td.retry_count, COALESCE(td.max_retries, 3)
    INTO cur_retry, cur_max
  FROM public.task_devices td
  WHERE td.id = task_device_id
    AND td.status = 'running'
    AND td.claimed_by_pc_id = runner_pc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    final_status := 'no-op';
    retry_count_out := NULL;
    RETURN NEXT;
    RETURN;
  END IF;

  IF retryable AND (cur_retry + 1 < cur_max) THEN
    UPDATE public.task_devices
    SET status = 'queued',
        retry_count = cur_retry + 1,
        error = error_text,
        last_error_at = now(),
        lease_expires_at = NULL,
        claimed_by_pc_id = NULL,
        updated_at = now()
    WHERE id = task_device_id;

    final_status := 'queued';
    retry_count_out := cur_retry + 1;
    RETURN NEXT;
  ELSE
    UPDATE public.task_devices
    SET status = 'failed',
        retry_count = cur_retry + 1,
        error = error_text,
        last_error_at = now(),
        completed_at = now(),
        lease_expires_at = NULL,
        claimed_by_pc_id = NULL,
        updated_at = now()
    WHERE id = task_device_id;

    final_status := 'failed';
    retry_count_out := cur_retry + 1;
    RETURN NEXT;
  END IF;
END $$;

COMMENT ON FUNCTION public.claim_task_devices_for_pc(UUID, INT, INT) IS 'Claim up to N queued task_devices for runner_pc_id; one running per device; lease_minutes.';
COMMENT ON FUNCTION public.renew_task_device_lease(UUID, UUID, INT) IS 'Extend lease for running task_device (heartbeat).';
COMMENT ON FUNCTION public.complete_task_device(UUID, UUID, JSONB) IS 'Mark task_device completed and clear lease.';
COMMENT ON FUNCTION public.fail_or_retry_task_device(UUID, UUID, TEXT, BOOLEAN) IS 'Fail or requeue for retry (retry_count < max_retries).';
