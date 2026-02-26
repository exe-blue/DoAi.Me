-- Seed: WATCH_MAIN workflow and 4 scripts (yt_preflight, yt_search_title, yt_watch, yt_actions)
-- Scripts are referenced by (id, version) in workflow steps; use fixed UUIDs for reproducibility.

-- Script UUIDs (must match workflow steps.scriptRef.id)
-- yt_preflight, yt_search_title, yt_watch, yt_actions
INSERT INTO public.scripts (
  id, name, version, status, type, content, timeout_ms, params_schema, default_params
) VALUES
  (
    'a1000001-0000-4000-8000-000000000001'::uuid,
    'yt_preflight',
    1,
    'active',
    'javascript',
    '/* yt_preflight placeholder */',
    60000,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    'a1000001-0000-4000-8000-000000000002'::uuid,
    'yt_search_title',
    1,
    'active',
    'javascript',
    '/* yt_search_title placeholder */',
    120000,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    'a1000001-0000-4000-8000-000000000003'::uuid,
    'yt_watch',
    1,
    'active',
    'javascript',
    '/* yt_watch placeholder */',
    300000,
    '{}'::jsonb,
    '{}'::jsonb
  ),
  (
    'a1000001-0000-4000-8000-000000000004'::uuid,
    'yt_actions',
    1,
    'active',
    'javascript',
    '/* yt_actions placeholder */',
    120000,
    '{}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- WATCH_MAIN workflow: steps reference script ids above (version 1)
INSERT INTO public.workflows (id, version, kind, name, is_active, steps)
VALUES (
  'WATCH_MAIN',
  1,
  'MAIN',
  'WATCH_BY_TITLE_V1',
  true,
  '[
    {"scriptRef": {"id": "a1000001-0000-4000-8000-000000000001", "version": 1}, "params": {}, "waitSecAfter": 1},
    {"scriptRef": {"id": "a1000001-0000-4000-8000-000000000002", "version": 1}, "params": {"mode": "title"}, "waitSecAfter": 2},
    {"scriptRef": {"id": "a1000001-0000-4000-8000-000000000003", "version": 1}, "params": {"minWatchSec": 240, "maxWatchSec": 420}, "waitSecAfter": 1},
    {"scriptRef": {"id": "a1000001-0000-4000-8000-000000000004", "version": 1}, "params": {"like": true, "comment": true, "scrap": true}, "waitSecAfter": 0}
  ]'::jsonb
)
ON CONFLICT (id, version) DO NOTHING;
