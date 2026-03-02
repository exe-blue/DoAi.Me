-- R1 Phase 0 (5/5): seed — scripts 4개 (active) + WATCH_MAIN workflow upsert
-- steps 형식: WorkflowStep[] = [{ops:[{type,scriptRef:{scriptId,id,version},params}]}]
-- idempotent — ON CONFLICT DO NOTHING / DO UPDATE

-- ── Scripts ──────────────────────────────────────────────────────────────
INSERT INTO public.scripts
  (id, name, version, status, type, content, timeout_ms, params_schema, default_params)
VALUES
  (
    'a1000001-0000-4000-8000-000000000001'::uuid,
    'yt/preflight', 1, 'active', 'javascript',
    'export default async function(ctx, params) { if (ctx?.log) ctx.log("yt/preflight ok"); }',
    60000, '{}'::jsonb, '{}'::jsonb
  ),
  (
    'a1000001-0000-4000-8000-000000000002'::uuid,
    'yt/search-title', 1, 'active', 'javascript',
    'export default async function(ctx, params) { if (ctx?.log) ctx.log("yt/search-title mode=" + (params?.mode ?? "title")); }',
    120000,
    '{"mode":{"type":"string","enum":["title","url"],"default":"title"}}'::jsonb,
    '{"mode":"title"}'::jsonb
  ),
  (
    'a1000001-0000-4000-8000-000000000003'::uuid,
    'yt/watch', 1, 'active', 'javascript',
    'export default async function(ctx, params) { if (ctx?.log) ctx.log("yt/watch min=" + (params?.minWatchSec ?? 240) + "s"); }',
    300000,
    '{"minWatchSec":{"type":"integer"},"maxWatchSec":{"type":"integer"}}'::jsonb,
    '{"minWatchSec":240,"maxWatchSec":420}'::jsonb
  ),
  (
    'a1000001-0000-4000-8000-000000000004'::uuid,
    'yt/actions', 1, 'active', 'javascript',
    'export default async function(ctx, params) { if (ctx?.log) ctx.log("yt/actions like=" + params?.like); }',
    120000,
    '{"like":{"type":"boolean"},"comment":{"type":"boolean"},"scrap":{"type":"boolean"}}'::jsonb,
    '{"like":true,"comment":true,"scrap":true}'::jsonb
  )
ON CONFLICT (id, version) DO NOTHING;

-- ── WATCH_MAIN workflow ───────────────────────────────────────────────────
-- steps: WorkflowStep[] — 각 step은 ops 배열을 가짐
-- scriptRef: {scriptId, id (alias), version}
INSERT INTO public.workflows (id, version, kind, name, is_active, steps)
VALUES (
  'WATCH_MAIN',
  1,
  'MAIN',
  'Watch By Title v1',
  true,
  '[
    {
      "ops": [{
        "type": "javascript",
        "scriptRef": {
          "scriptId": "a1000001-0000-4000-8000-000000000001",
          "id":       "a1000001-0000-4000-8000-000000000001",
          "version":  1
        },
        "params": {}
      }]
    },
    {
      "ops": [{
        "type": "javascript",
        "scriptRef": {
          "scriptId": "a1000001-0000-4000-8000-000000000002",
          "id":       "a1000001-0000-4000-8000-000000000002",
          "version":  1
        },
        "params": {"mode": "title"}
      }]
    },
    {
      "ops": [{
        "type": "javascript",
        "scriptRef": {
          "scriptId": "a1000001-0000-4000-8000-000000000003",
          "id":       "a1000001-0000-4000-8000-000000000003",
          "version":  1
        },
        "params": {"minWatchSec": 240, "maxWatchSec": 420}
      }]
    },
    {
      "ops": [{
        "type": "javascript",
        "scriptRef": {
          "scriptId": "a1000001-0000-4000-8000-000000000004",
          "id":       "a1000001-0000-4000-8000-000000000004",
          "version":  1
        },
        "params": {"like": true, "comment": true, "scrap": true}
      }]
    }
  ]'::jsonb
)
ON CONFLICT (id, version) DO UPDATE SET
  steps      = EXCLUDED.steps,
  name       = EXCLUDED.name,
  kind       = EXCLUDED.kind,
  is_active  = EXCLUDED.is_active,
  updated_at = now();
