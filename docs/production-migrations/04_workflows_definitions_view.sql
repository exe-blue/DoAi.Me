-- 프로덕션: workflows_definitions 뷰 생성
-- workflows 테이블에 kind 컬럼 추가 (없는 경우) 후 뷰 생성
alter table public.workflows add column if not exists kind text;

create or replace view public.workflows_definitions as
select
  id::text,
  version,
  kind,
  name,
  coalesce(is_active, true) as is_active,
  coalesce(steps, '[]'::jsonb) as steps,
  coalesce(created_at, now()) as created_at,
  coalesce(updated_at, now()) as updated_at
from public.workflows;
