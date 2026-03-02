-- R1 Phase 0 (1/5): scripts 테이블
-- idempotent — CREATE TABLE IF NOT EXISTS + 조건부 constraints

CREATE TABLE IF NOT EXISTS public.scripts (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  version     INT         NOT NULL DEFAULT 1,
  status      TEXT        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'archived')),
  type        TEXT        NOT NULL DEFAULT 'javascript'
                CHECK (type IN ('javascript', 'adb_shell')),
  content     TEXT        NOT NULL DEFAULT '',
  timeout_ms  INT         NOT NULL DEFAULT 180000,
  params_schema  JSONB    NOT NULL DEFAULT '{}'::JSONB,
  default_params JSONB    NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT scripts_pkey PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_scripts_name         ON public.scripts(name);
CREATE INDEX IF NOT EXISTS idx_scripts_status        ON public.scripts(status);
CREATE INDEX IF NOT EXISTS idx_scripts_name_version  ON public.scripts(name, version DESC);

-- name: path 형식 (segment/segment)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scripts_name_path_check'
      AND conrelid = 'public.scripts'::regclass
  ) THEN
    ALTER TABLE public.scripts
      ADD CONSTRAINT scripts_name_path_check
      CHECK (name ~ '^[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$');
  END IF;
END $$;

-- name: prefix allowlist (yt/, device/, ops/)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scripts_name_prefix_allowlist'
      AND conrelid = 'public.scripts'::regclass
  ) THEN
    ALTER TABLE public.scripts
      ADD CONSTRAINT scripts_name_prefix_allowlist
      CHECK (name LIKE 'yt/%' OR name LIKE 'device/%' OR name LIKE 'ops/%');
  END IF;
END $$;

COMMENT ON TABLE  public.scripts IS 'Versioned JavaScript/ADB scripts. PK = (id, version). Agent uses pinned (id, version) from task_devices.config snapshot.';
COMMENT ON COLUMN public.scripts.status IS 'draft → active → archived. Only active scripts can be published into tasks.';
