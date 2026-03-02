-- 프로덕션: task_devices 테이블 + RPC 4개 (claim / renew_lease / complete / fail_or_retry)
-- 이미 테이블이 있는 경우: ADD COLUMN IF NOT EXISTS / DROP+ADD CONSTRAINT 로 멱등 처리
create table if not exists public.task_devices (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  pc_id uuid not null references public.pcs(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,
  device_target text,
  status text not null default 'queued',
  priority int not null default 0,
  retry_count int not null default 0,
  max_retries int not null default 3,
  claimed_by_pc_id uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  config jsonb not null default '{}'::jsonb,
  result jsonb default '{}'::jsonb,
  error text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 기존 테이블에 없는 컬럼 추가 (이미 있으면 무시)
alter table public.task_devices add column if not exists priority int not null default 0;
alter table public.task_devices add column if not exists retry_count int not null default 0;
alter table public.task_devices add column if not exists max_retries int not null default 3;
alter table public.task_devices add column if not exists last_error_at timestamptz;

-- attempt/max_attempts → retry_count/max_retries 동기화 (기존 행)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='task_devices' and column_name='attempt'
  ) then
    update public.task_devices
    set retry_count = coalesce(attempt, 0),
        max_retries = coalesce(max_attempts, 3)
    where retry_count = 0;
  end if;
end $$;

-- status check: 기존 제약 삭제 후 queued 포함된 버전으로 재생성
alter table public.task_devices drop constraint if exists task_devices_status_check;
alter table public.task_devices add constraint task_devices_status_check
  check (status in ('pending','queued','running','completed','failed','cancelled'));

create index if not exists idx_task_devices_task_id on public.task_devices(task_id);
create index if not exists idx_task_devices_pc_id on public.task_devices(pc_id);
create index if not exists idx_task_devices_device_id on public.task_devices(device_id);
create index if not exists idx_task_devices_queued on public.task_devices(status, created_at) where status in ('queued','pending');
create index if not exists idx_task_devices_running_lease on public.task_devices(device_id, lease_expires_at) where status='running';

-- 기존 RPC 모두 삭제 (시그니처 변경으로 CREATE OR REPLACE 불가)
drop function if exists public.claim_task_devices_for_pc(integer, integer, uuid);
drop function if exists public.claim_task_devices_for_pc(text, integer, integer);
drop function if exists public.claim_task_devices_for_pc(uuid, integer, integer);
drop function if exists public.complete_task_device(uuid, jsonb);
drop function if exists public.complete_task_device(uuid, uuid, jsonb);
drop function if exists public.fail_or_retry_task_device(uuid, text);
drop function if exists public.fail_or_retry_task_device(uuid, uuid, text, boolean);
drop function if exists public.renew_task_device_lease(uuid, uuid, integer);

-- RPC 1: claim (pending + queued 둘 다 픽업하여 트리거 기본값과 호환)
create or replace function public.claim_task_devices_for_pc(
  runner_pc_id uuid,
  max_to_claim int default 10,
  lease_minutes int default 5
)
returns setof public.task_devices
language sql
as $$
with candidate as (
  select td.id
  from public.task_devices td
  where td.pc_id = runner_pc_id
    and td.status in ('queued','pending')
    and td.retry_count < td.max_retries
    and not exists (
      select 1
      from public.task_devices td2
      where td2.device_id = td.device_id
        and td2.status = 'running'
        and coalesce(td2.lease_expires_at, now() - interval '1 day') > now()
    )
  order by td.priority desc, td.created_at asc
  limit greatest(max_to_claim, 0)
  for update skip locked
),
updated as (
  update public.task_devices td
  set status='running',
      claimed_by_pc_id=runner_pc_id,
      lease_expires_at=now() + make_interval(mins => lease_minutes),
      started_at=coalesce(td.started_at, now()),
      updated_at=now()
  where td.id in (select id from candidate)
  returning td.*
)
select * from updated;
$$;

-- RPC 2: renew_lease
create or replace function public.renew_task_device_lease(
  task_device_id uuid,
  runner_pc_id uuid,
  lease_minutes int default 5
)
returns boolean
language plpgsql
as $$
declare updated_count int;
begin
  update public.task_devices
  set lease_expires_at=now() + make_interval(mins => lease_minutes),
      updated_at=now()
  where id=task_device_id and status='running' and claimed_by_pc_id=runner_pc_id;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end $$;

-- RPC 3: complete
create or replace function public.complete_task_device(
  task_device_id uuid,
  runner_pc_id uuid,
  result_json jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
as $$
declare updated_count int;
begin
  update public.task_devices
  set status='completed',
      completed_at=now(),
      lease_expires_at=null,
      result=coalesce(result,'{}'::jsonb) || coalesce(result_json,'{}'::jsonb),
      updated_at=now()
  where id=task_device_id and status='running' and claimed_by_pc_id=runner_pc_id;
  get diagnostics updated_count = row_count;
  return updated_count = 1;
end $$;

-- RPC 4: fail_or_retry
create or replace function public.fail_or_retry_task_device(
  task_device_id uuid,
  runner_pc_id uuid,
  error_text text,
  retryable boolean default true
)
returns table(final_status text, retry_count int)
language plpgsql
as $$
declare cur_retry int; cur_max int;
begin
  select td.retry_count, td.max_retries into cur_retry, cur_max
  from public.task_devices td
  where td.id=task_device_id and td.status='running' and td.claimed_by_pc_id=runner_pc_id
  for update;

  if not found then
    return query select 'no-op'::text, null::int; return;
  end if;

  if retryable and (cur_retry + 1) < cur_max then
    update public.task_devices
    set status='queued',
        retry_count=cur_retry+1,
        error=error_text,
        last_error_at=now(),
        lease_expires_at=null,
        claimed_by_pc_id=null,
        updated_at=now()
    where id=task_device_id;
    return query select 'queued'::text, cur_retry+1;
  else
    update public.task_devices
    set status='failed',
        retry_count=cur_retry+1,
        error=error_text,
        last_error_at=now(),
        completed_at=now(),
        lease_expires_at=null,
        updated_at=now()
    where id=task_device_id;
    return query select 'failed'::text, cur_retry+1;
  end if;
end $$;
