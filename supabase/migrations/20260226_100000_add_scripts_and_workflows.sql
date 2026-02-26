-- scripts: 실행 스크립트 버전 관리 (SSOT)
CREATE TABLE IF NOT EXISTS public.scripts (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT         NOT NULL,
  version       INT          NOT NULL,
  status        TEXT         NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  type          TEXT         NOT NULL DEFAULT 'javascript'
    CHECK (type IN ('javascript', 'adb_shell')),
  content       TEXT         NOT NULL,
  timeout_ms    INT          NOT NULL DEFAULT 180000,
  params_schema JSONB        NOT NULL DEFAULT '{}'::jsonb,
  default_params JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (id, version)
);

CREATE INDEX IF NOT EXISTS idx_scripts_status ON public.scripts(status);
CREATE INDEX IF NOT EXISTS idx_scripts_name ON public.scripts(name);

COMMENT ON TABLE public.scripts IS '실행 스크립트 버전 SSOT. type: javascript | adb_shell, status: draft | active | archived.';

-- workflows: 워크플로 정의 (MAIN/MAINTENANCE/EVENT)
CREATE TABLE IF NOT EXISTS public.workflows (
  id         TEXT         NOT NULL,
  version    INT          NOT NULL,
  kind       TEXT         NOT NULL
    CHECK (kind IN ('MAIN', 'MAINTENANCE', 'EVENT')),
  name       TEXT         NOT NULL,
  is_active  BOOLEAN      NOT NULL DEFAULT true,
  steps      JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS idx_workflows_id ON public.workflows(id);
CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON public.workflows(is_active);

COMMENT ON TABLE public.workflows IS '워크플로 정의 SSOT. kind: MAIN | MAINTENANCE | EVENT. steps: step payload array.';
