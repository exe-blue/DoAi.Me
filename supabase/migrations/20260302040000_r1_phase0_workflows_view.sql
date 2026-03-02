-- R1 Phase 0 (4/5): workflows 테이블 보강 + workflows_definitions VIEW 생성
-- ▸ CREATE TABLE workflows 하지 않음 — 기존 테이블 재활용
-- ▸ 필요한 컬럼만 ADD COLUMN IF NOT EXISTS 로 추가
-- ▸ workflows_definitions 가 TABLE로 존재하면 DROP 후 VIEW로 교체
-- idempotent

-- ── workflows 컬럼 보강 ───────────────────────────────────────────────────
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS version    INT         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kind       TEXT        NOT NULL DEFAULT 'MAIN'
                             CHECK (kind IN ('MAIN','MAINTENANCE','EVENT')),
  ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS steps      JSONB       NOT NULL DEFAULT '[]'::JSONB,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── workflows_definitions: TABLE이면 DROP, 그 후 VIEW 생성 ────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'workflows_definitions'
      AND  table_type   = 'BASE TABLE'
  ) THEN
    DROP TABLE public.workflows_definitions CASCADE;
    RAISE NOTICE 'Dropped workflows_definitions TABLE; replacing with VIEW.';
  END IF;
END $$;

CREATE OR REPLACE VIEW public.workflows_definitions AS
  SELECT
    id,
    version,
    kind,
    name,
    COALESCE(is_active, true)   AS is_active,
    COALESCE(steps, '[]'::JSONB) AS steps,
    created_at,
    updated_at
  FROM public.workflows;

COMMENT ON VIEW public.workflows_definitions IS
  'workflows 테이블의 read-only 뷰. 앱/에이전트 호환용. 데이터는 workflows 테이블에서 관리.';
