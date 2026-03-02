-- R1 Phase 0 (2/5): task_devices 테이블 + RPC 4개
-- idempotent

-- ── 테이블 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_devices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          UUID        NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  pc_id            UUID        NOT NULL REFERENCES public.pcs(id)   ON DELETE CASCADE,
  device_id        UUID        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued','running','completed','failed','canceled')),
  priority         INT         NOT NULL DEFAULT 0,
  retry_count      INT         NOT NULL DEFAULT 0,
  max_retries      INT         NOT NULL DEFAULT 3,
  claimed_by_pc_id UUID        REFERENCES public.pcs(id) ON DELETE SET NULL,
  lease_expires_at TIMESTAMPTZ,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  config           JSONB       NOT NULL DEFAULT '{}'::JSONB,
  result           JSONB                DEFAULT '{}'::JSONB,
  error            TEXT,
  last_error_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_devices_unique_task_device UNIQUE (task_id, device_id)
);

-- updated_at 트리거 (set_updated_at 또는 update_updated_at_column 둘 중 존재하는 것 사용)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_devices_updated_at') THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
    ) THEN
      CREATE TRIGGER trg_task_devices_updated_at
        BEFORE UPDATE ON public.task_devices
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ELSIF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
    ) THEN
      CREATE TRIGGER trg_task_devices_updated_at
        BEFORE UPDATE ON public.task_devices
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── 인덱스 ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_task_devices_task_id  ON public.task_devices(task_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_pc_id    ON public.task_devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_device_id ON public.task_devices(device_id);
-- 대기 중 작업 빠른 탐색
CREATE INDEX IF NOT EXISTS idx_task_devices_queued
  ON public.task_devices(pc_id, priority DESC, created_at ASC)
  WHERE status = 'queued';
-- 실행 중 lease 만료 감지
CREATE INDEX IF NOT EXISTS idx_task_devices_running_lease
  ON public.task_devices(device_id, lease_expires_at)
  WHERE status = 'running';

-- ── RPC 1: claim_task_devices_for_pc ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_task_devices_for_pc(
  runner_pc_id  UUID,
  max_to_claim  INT  DEFAULT 10,
  lease_minutes INT  DEFAULT 5
)
RETURNS SETOF public.task_devices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  lease_interval INTERVAL := make_interval(mins => lease_minutes);
  _row           public.task_devices%ROWTYPE;
  _limit         INT := GREATEST(max_to_claim, 0);
BEGIN
  FOR _row IN
    SELECT td.*
    FROM   public.task_devices td
    WHERE  td.pc_id = runner_pc_id
      AND  td.status IN ('queued')
      AND  COALESCE(td.retry_count, 0) < COALESCE(td.max_retries, 3)
      -- 같은 device에 이미 유효한 running 작업 없어야 함
      AND  NOT EXISTS (
             SELECT 1 FROM public.task_devices td2
             WHERE  td2.device_id = td.device_id
               AND  td2.status = 'running'
               AND  COALESCE(td2.lease_expires_at, now() - interval '1 day') > now()
           )
    ORDER BY COALESCE(td.priority, 0) DESC, td.created_at ASC
    LIMIT  _limit
    FOR UPDATE OF td SKIP LOCKED
  LOOP
    UPDATE public.task_devices
    SET    status           = 'running',
           claimed_by_pc_id = runner_pc_id,
           lease_expires_at = now() + lease_interval,
           started_at       = COALESCE(started_at, now()),
           updated_at       = now()
    WHERE  id = _row.id;
    SELECT * INTO _row FROM public.task_devices WHERE id = _row.id;
    RETURN NEXT _row;
  END LOOP;
END;
$$;

-- ── RPC 2: renew_task_device_lease ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.renew_task_device_lease(
  task_device_id UUID,
  runner_pc_id   UUID,
  lease_minutes  INT DEFAULT 5
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE updated_count INT;
BEGIN
  UPDATE public.task_devices
  SET    lease_expires_at = now() + make_interval(mins => lease_minutes),
         updated_at       = now()
  WHERE  id               = task_device_id
    AND  status           = 'running'
    AND  claimed_by_pc_id = runner_pc_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

-- ── RPC 3: complete_task_device ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_task_device(
  task_device_id UUID,
  runner_pc_id   UUID,
  result_json    JSONB DEFAULT '{}'::JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE updated_count INT;
BEGIN
  UPDATE public.task_devices
  SET    status           = 'completed',
         completed_at     = now(),
         lease_expires_at = NULL,
         claimed_by_pc_id = NULL,
         result           = COALESCE(result, '{}'::JSONB) || COALESCE(result_json, '{}'::JSONB),
         updated_at       = now()
  WHERE  id               = task_device_id
    AND  status           = 'running'
    AND  claimed_by_pc_id = runner_pc_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END;
$$;

-- ── RPC 4: fail_or_retry_task_device ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fail_or_retry_task_device(
  task_device_id UUID,
  runner_pc_id   UUID,
  error_text     TEXT,
  retryable      BOOLEAN DEFAULT true
)
RETURNS TABLE(final_status TEXT, retry_count_out INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur_retry INT;
  cur_max   INT;
BEGIN
  SELECT td.retry_count, COALESCE(td.max_retries, 3)
  INTO   cur_retry, cur_max
  FROM   public.task_devices td
  WHERE  td.id               = task_device_id
    AND  td.status           = 'running'
    AND  td.claimed_by_pc_id = runner_pc_id
  FOR UPDATE;

  IF NOT FOUND THEN
    final_status := 'no-op'; retry_count_out := NULL; RETURN NEXT; RETURN;
  END IF;

  IF retryable AND (cur_retry + 1 < cur_max) THEN
    UPDATE public.task_devices
    SET    status           = 'queued',
           retry_count      = cur_retry + 1,
           error            = error_text,
           last_error_at    = now(),
           lease_expires_at = NULL,
           claimed_by_pc_id = NULL,
           updated_at       = now()
    WHERE  id = task_device_id;
    final_status := 'queued'; retry_count_out := cur_retry + 1;
  ELSE
    UPDATE public.task_devices
    SET    status           = 'failed',
           retry_count      = cur_retry + 1,
           error            = error_text,
           last_error_at    = now(),
           completed_at     = now(),
           lease_expires_at = NULL,
           claimed_by_pc_id = NULL,
           updated_at       = now()
    WHERE  id = task_device_id;
    final_status := 'failed'; retry_count_out := cur_retry + 1;
  END IF;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.claim_task_devices_for_pc(UUID,INT,INT)  IS 'queued → running: 최대 N개 claim, device당 1개 running 제한.';
COMMENT ON FUNCTION public.renew_task_device_lease(UUID,UUID,INT)   IS 'running 상태 lease 연장 (30s 주기 heartbeat).';
COMMENT ON FUNCTION public.complete_task_device(UUID,UUID,JSONB)    IS 'running → completed, lease 해제.';
COMMENT ON FUNCTION public.fail_or_retry_task_device(UUID,UUID,TEXT,BOOLEAN) IS 'retry_count < max_retries → queued 재대기, 그 외 → failed.';
