-- Release 1: task_devices 실행 엔진 + scripts/workflows + seed
-- 프로덕션 DB에 task_devices/scripts 없을 때 한 번 실행. idempotent.
-- 포함: devices.connection_id, scripts, workflows_definitions, scripts name 유니크+prefix allowlist,
--       task_devices 테이블, RPC 4(claim/renew/complete/fail_or_retry), seed WATCH_MAIN + scripts 4개

-- 1) devices.connection_id (실행 타겟: connection_id ?? serial)
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS connection_id TEXT;
COMMENT ON COLUMN public.devices.connection_id IS 'Xiaowei connection identifier (e.g. IP:5555). NULL for USB. device_target = connection_id ?? serial.';
CREATE INDEX IF NOT EXISTS idx_devices_connection_id ON public.devices(connection_id) WHERE connection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_pc_id ON public.devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_devices_serial ON public.devices(serial);

-- 2) scripts 테이블
CREATE TABLE IF NOT EXISTS public.scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  type TEXT NOT NULL DEFAULT 'javascript' CHECK (type IN ('javascript','adb_shell')),
  content TEXT NOT NULL,
  timeout_ms INT NOT NULL DEFAULT 180000,
  params_schema JSONB NOT NULL DEFAULT '{}'::JSONB,
  default_params JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scripts_pkey PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS idx_scripts_name ON public.scripts(name);
CREATE INDEX IF NOT EXISTS idx_scripts_status ON public.scripts(status);

-- 3) workflows_definitions (워크플로 버전별 정의)
CREATE TABLE IF NOT EXISTS public.workflows_definitions (
  id TEXT NOT NULL,
  version INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('MAIN','MAINTENANCE','EVENT')),
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  steps JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workflows_definitions_pkey PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS idx_workflows_definitions_id ON public.workflows_definitions(id);
CREATE INDEX IF NOT EXISTS idx_workflows_definitions_active ON public.workflows_definitions(is_active);

-- 4) scripts.name: unique + path 형식 + prefix allowlist (yt/, device/, ops/)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_name_unique') THEN
    ALTER TABLE public.scripts ADD CONSTRAINT scripts_name_unique UNIQUE (name);
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_name_path_check') THEN
    ALTER TABLE public.scripts ADD CONSTRAINT scripts_name_path_check
      CHECK (name ~ '^[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$');
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scripts_name_prefix_allowlist') THEN
    ALTER TABLE public.scripts ADD CONSTRAINT scripts_name_prefix_allowlist
      CHECK (name LIKE 'yt/%' OR name LIKE 'device/%' OR name LIKE 'ops/%');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_scripts_name_version ON public.scripts(name, version DESC);

-- 5) task_devices 테이블 (없으면 생성, 있으면 컬럼 보강)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'task_devices') THEN
    CREATE TABLE public.task_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
      pc_id UUID NOT NULL REFERENCES public.pcs(id) ON DELETE CASCADE,
      device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','pending','running','completed','failed','canceled')),
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
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS pc_id UUID REFERENCES public.pcs(id) ON DELETE CASCADE;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS max_retries INT NOT NULL DEFAULT 3;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS claimed_by_pc_id UUID REFERENCES public.pcs(id) ON DELETE SET NULL;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS config JSONB;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS result JSONB;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMPTZ;
    ALTER TABLE public.task_devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE public.task_devices ALTER COLUMN retry_count SET DEFAULT 0;
    UPDATE public.task_devices td SET pc_id = d.pc_id
      FROM public.devices d
      WHERE td.pc_id IS NULL AND td.device_serial IS NOT NULL AND d.serial = td.device_serial;
    UPDATE public.task_devices td SET device_id = d.id
      FROM public.devices d
      WHERE td.device_id IS NULL AND td.device_serial IS NOT NULL AND d.serial = td.device_serial
        AND (td.pc_id = d.pc_id OR td.pc_id IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'set_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_devices_set_updated_at') THEN
      CREATE TRIGGER trg_task_devices_set_updated_at BEFORE UPDATE ON public.task_devices
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    END IF;
  ELSIF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_task_devices_updated_at') THEN
      CREATE TRIGGER trg_task_devices_updated_at BEFORE UPDATE ON public.task_devices
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_task_devices_task_id ON public.task_devices(task_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_pc_id ON public.task_devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_device_id ON public.task_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_queued ON public.task_devices(status, created_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_task_devices_running_lease ON public.task_devices(device_id, lease_expires_at) WHERE status = 'running';

-- 6) RPC: claim_task_devices_for_pc
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

-- 7) RPC: renew_task_device_lease
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
DECLARE updated_count INT;
BEGIN
  UPDATE public.task_devices
  SET lease_expires_at = now() + make_interval(mins => lease_minutes), updated_at = now()
  WHERE id = task_device_id AND status = 'running' AND claimed_by_pc_id = runner_pc_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END $$;

-- 8) RPC: complete_task_device
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
DECLARE updated_count INT;
BEGIN
  UPDATE public.task_devices
  SET status = 'completed', completed_at = now(), lease_expires_at = NULL, claimed_by_pc_id = NULL,
      result = COALESCE(result, '{}'::JSONB) || COALESCE(result_json, '{}'::JSONB), updated_at = now()
  WHERE id = task_device_id AND status = 'running' AND claimed_by_pc_id = runner_pc_id;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count = 1;
END $$;

-- 9) RPC: fail_or_retry_task_device
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
DECLARE cur_retry INT; cur_max INT;
BEGIN
  SELECT td.retry_count, COALESCE(td.max_retries, 3) INTO cur_retry, cur_max
  FROM public.task_devices td
  WHERE td.id = task_device_id AND td.status = 'running' AND td.claimed_by_pc_id = runner_pc_id
  FOR UPDATE;
  IF NOT FOUND THEN
    final_status := 'no-op'; retry_count_out := NULL; RETURN NEXT; RETURN;
  END IF;
  IF retryable AND (cur_retry + 1 < cur_max) THEN
    UPDATE public.task_devices
    SET status = 'queued', retry_count = cur_retry + 1, error = error_text, last_error_at = now(),
        lease_expires_at = NULL, claimed_by_pc_id = NULL, updated_at = now()
    WHERE id = task_device_id;
    final_status := 'queued'; retry_count_out := cur_retry + 1; RETURN NEXT;
  ELSE
    UPDATE public.task_devices
    SET status = 'failed', retry_count = cur_retry + 1, error = error_text, last_error_at = now(),
        completed_at = now(), lease_expires_at = NULL, claimed_by_pc_id = NULL, updated_at = now()
    WHERE id = task_device_id;
    final_status := 'failed'; retry_count_out := cur_retry + 1; RETURN NEXT;
  END IF;
END $$;

COMMENT ON FUNCTION public.claim_task_devices_for_pc(UUID, INT, INT) IS 'Claim up to N queued task_devices for runner_pc_id; one running per device.';
COMMENT ON FUNCTION public.renew_task_device_lease(UUID, UUID, INT) IS 'Extend lease for running task_device (heartbeat).';
COMMENT ON FUNCTION public.complete_task_device(UUID, UUID, JSONB) IS 'Mark task_device completed and clear lease.';
COMMENT ON FUNCTION public.fail_or_retry_task_device(UUID, UUID, TEXT, BOOLEAN) IS 'Fail or requeue (retry_count < max_retries).';

-- 10) Seed: WATCH_MAIN(1) + scripts 4개 (name: yt/... prefix allowlist 준수)
INSERT INTO public.scripts (id, name, version, status, type, content, timeout_ms, params_schema, default_params)
VALUES
  ('a1000001-0000-4000-8000-000000000001'::uuid, 'yt/preflight', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt/preflight"); }', 60000, '{}'::jsonb, '{}'::jsonb),
  ('a1000001-0000-4000-8000-000000000002'::uuid, 'yt/search_title', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt/search_title"); }', 120000, '{}'::jsonb, '{}'::jsonb),
  ('a1000001-0000-4000-8000-000000000003'::uuid, 'yt/watch', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt/watch"); }', 300000, '{}'::jsonb, '{}'::jsonb),
  ('a1000001-0000-4000-8000-000000000004'::uuid, 'yt/actions', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt/actions"); }', 120000, '{}'::jsonb, '{}'::jsonb)
ON CONFLICT (id, version) DO NOTHING;

INSERT INTO public.workflows_definitions (id, version, kind, name, is_active, steps)
VALUES (
  'WATCH_MAIN', 1, 'MAIN', 'WATCH_BY_TITLE_V1', true,
  '[
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000001","id":"a1000001-0000-4000-8000-000000000001","version":1},"params":{},"waitSecAfter":1},
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000002","id":"a1000001-0000-4000-8000-000000000002","version":1},"params":{"mode":"title"},"waitSecAfter":2},
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000003","id":"a1000001-0000-4000-8000-000000000003","version":1},"params":{"minWatchSec":240,"maxWatchSec":420},"waitSecAfter":1},
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000004","id":"a1000001-0000-4000-8000-000000000004","version":1},"params":{"like":true,"comment":true,"scrap":true},"waitSecAfter":0}
  ]'::jsonb
)
ON CONFLICT (id, version) DO NOTHING;
