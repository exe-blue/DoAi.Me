-- 프로덕션: workflows 재활용. 앱이 읽는 workflows_definitions는 기존 workflows 테이블의 뷰로 제공.
-- 기존 workflows에 id, version, kind, name, is_active, steps, created_at, updated_at 컬럼이 있어야 함.
-- 없으면 ALTER TABLE workflows 로 보강 후 이 뷰 생성.
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
