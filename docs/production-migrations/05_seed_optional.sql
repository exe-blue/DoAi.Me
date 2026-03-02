-- (선택) 테스트/부팅용 시드: WATCH_MAIN 워크플로 + scripts 4개
-- 기존 workflows 테이블에 INSERT, scripts 테이블에 INSERT. Release 2에서 편집기/스크립트 UI로 대체.

-- 1) scripts 4개 (id+version 고정, status=active)
insert into public.scripts (
  id, name, version, status, type, content, timeout_ms, params_schema, default_params
) values
  ('a1000001-0000-4000-8000-000000000001'::uuid, 'yt_preflight', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_preflight"); }',
   60000, '{}'::jsonb, '{}'::jsonb),
  ('a1000001-0000-4000-8000-000000000002'::uuid, 'yt_search_title', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_search_title"); }',
   120000, '{}'::jsonb, '{}'::jsonb),
  ('a1000001-0000-4000-8000-000000000003'::uuid, 'yt_watch', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_watch"); }',
   300000, '{}'::jsonb, '{}'::jsonb),
  ('a1000001-0000-4000-8000-000000000004'::uuid, 'yt_actions', 1, 'active', 'javascript',
   'export default async function(ctx, params) { if (ctx && ctx.log) ctx.log("yt_actions"); }',
   120000, '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- 2) workflows에 WATCH_MAIN 한 건 (workflows.id는 text 타입)
insert into public.workflows (id, version, kind, name, is_active, steps)
values (
  'WATCH_MAIN',
  1,
  'MAIN',
  'WATCH_BY_TITLE_V1',
  true,
  '[
    {"ops":[{"type":"javascript","scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000001","version":1},"params":{}}]},
    {"ops":[{"type":"javascript","scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000002","version":1},"params":{"mode":"title"}}]},
    {"ops":[{"type":"javascript","scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000003","version":1},"params":{"minWatchSec":240,"maxWatchSec":420}}]},
    {"ops":[{"type":"javascript","scriptRef":{"scriptId":"a1000001-0000-4000-8000-000000000004","version":1},"params":{"like":true,"comment":true,"scrap":true}}]}
  ]'::jsonb
)
on conflict (id, version) do nothing;
