-- Seed: WATCH_MAIN(1) + scripts 4개(1). 테스트/부팅용; Release 2에서 편집기/스크립트 관리 UI로 대체.
-- scripts.content: placeholder "default export async function(ctx, params){ ctx.log(...); }"
-- workflows_definitions.steps: scriptRef { scriptId, version } 필수, 버전 고정.

insert into public.scripts (
  id, name, version, status, type, content, timeout_ms, params_schema, default_params
) values
  (
    'a1000001-0000-4000-8000-000000000001'::uuid,
    'yt_preflight',
    1,
    'active',
    'javascript',
    'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_preflight"); }',
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
    'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_search_title"); }',
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
    'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_watch"); }',
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
    'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_actions"); }',
    120000,
    '{}'::jsonb,
    '{}'::jsonb
  )
on conflict (id, version) do nothing;

insert into public.workflows_definitions (id, version, kind, name, is_active, steps)
values (
  'WATCH_MAIN',
  1,
  'MAIN',
  'WATCH_BY_TITLE_V1',
  true,
  '[
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000001","id":"a1000001-0000-4000-8000-000000000001","version":1},"params":{},"waitSecAfter":1},
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000002","id":"a1000001-0000-4000-8000-000000000002","version":1},"params":{"mode":"title"},"waitSecAfter":2},
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000003","id":"a1000001-0000-4000-8000-000000000003","version":1},"params":{"minWatchSec":240,"maxWatchSec":420},"waitSecAfter":1},
    {"scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000004","id":"a1000001-0000-4000-8000-000000000004","version":1},"params":{"like":true,"comment":true,"scrap":true},"waitSecAfter":0}
  ]'::jsonb
)
on conflict (id, version) do nothing;
