-- 0) devices.connection_id 추가 (OTG 실행 타겟용)
alter table public.devices
  add column if not exists connection_id text;

create index if not exists idx_devices_connection_id
  on public.devices(connection_id);

create index if not exists idx_devices_pc_id
  on public.devices(pc_id);

-- codebase uses "serial" not serial_number
create index if not exists idx_devices_serial
  on public.devices(serial);

-- 1) task_devices SSOT 테이블 신설
create table if not exists public.task_devices (
  id uuid primary key default gen_random_uuid(),

  task_id uuid not null references public.tasks(id) on delete cascade,
  pc_id uuid not null references public.pcs(id) on delete cascade,
  device_id uuid not null references public.devices(id) on delete cascade,

  status text not null default 'queued'
    check (status in ('queued','running','completed','failed','canceled')),

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
  updated_at timestamptz not null default now(),

  constraint task_devices_unique_task_device unique (task_id, device_id)
);

-- updated_at 자동 갱신 트리거(존재 시 사용, 없으면 생략)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    if not exists (select 1 from pg_trigger where tgname = 'trg_task_devices_set_updated_at') then
      create trigger trg_task_devices_set_updated_at
      before update on public.task_devices
      for each row
      execute function public.set_updated_at();
    end if;
  end if;
end $$;

-- 2) 인덱스(성능 핵심)
create index if not exists idx_task_devices_task_id
  on public.task_devices(task_id);

create index if not exists idx_task_devices_pc_id
  on public.task_devices(pc_id);

create index if not exists idx_task_devices_device_id
  on public.task_devices(device_id);

create index if not exists idx_task_devices_queued
  on public.task_devices(status, created_at)
  where status = 'queued';

create index if not exists idx_task_devices_running_lease
  on public.task_devices(device_id, lease_expires_at)
  where status = 'running';

-- 3) 원자 Claim RPC (plpgsql: CTE 내 FOR UPDATE SKIP LOCKED 미지원)
create or replace function public.claim_task_devices_for_pc(
  runner_pc_id uuid,
  max_to_claim int default 10,
  lease_minutes int default 5
)
returns setof public.task_devices
language plpgsql
security definer
set search_path = public
as $$
declare
  lease_interval interval := make_interval(mins => lease_minutes);
  _row public.task_devices%rowtype;
  _limit int := greatest(max_to_claim, 0);
begin
  for _row in
    select td.*
    from public.task_devices td
    where td.pc_id = runner_pc_id
      and td.status = 'queued'
      and td.retry_count < td.max_retries
      and not exists (
        select 1
        from public.task_devices td2
        where td2.device_id = td.device_id
          and td2.status = 'running'
          and coalesce(td2.lease_expires_at, now() - interval '1 day') > now()
      )
    order by td.priority desc, td.created_at asc
    limit _limit
    for update of td skip locked
  loop
    update public.task_devices
    set status = 'running',
        claimed_by_pc_id = runner_pc_id,
        lease_expires_at = now() + lease_interval,
        started_at = coalesce(started_at, now()),
        updated_at = now()
    where id = _row.id;
    select * into _row from public.task_devices where id = _row.id;
    return next _row;
  end loop;
  return;
end $$;

-- 4) Lease 갱신 RPC
create or replace function public.renew_task_device_lease(
  task_device_id uuid,
  runner_pc_id uuid,
  lease_minutes int default 5
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
begin
  update public.task_devices
  set lease_expires_at = now() + make_interval(mins => lease_minutes),
      updated_at = now()
  where id = task_device_id
    and status = 'running'
    and claimed_by_pc_id = runner_pc_id;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end $$;

-- 5) 완료 처리 RPC
create or replace function public.complete_task_device(
  task_device_id uuid,
  runner_pc_id uuid,
  result_json jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count int;
begin
  update public.task_devices
  set status = 'completed',
      completed_at = now(),
      lease_expires_at = null,
      result = coalesce(result, '{}'::jsonb) || coalesce(result_json, '{}'::jsonb),
      updated_at = now()
  where id = task_device_id
    and status = 'running'
    and claimed_by_pc_id = runner_pc_id;

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end $$;

-- 6) 실패/재시도 처리 RPC
create or replace function public.fail_or_retry_task_device(
  task_device_id uuid,
  runner_pc_id uuid,
  error_text text,
  retryable boolean default true
)
returns table(final_status text, retry_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_retry int;
  cur_max int;
begin
  select td.retry_count, td.max_retries
    into cur_retry, cur_max
  from public.task_devices td
  where td.id = task_device_id
    and td.status = 'running'
    and td.claimed_by_pc_id = runner_pc_id
  for update;

  if not found then
    return query select 'no-op'::text, null::int;
    return;
  end if;

  if retryable and (cur_retry + 1) < cur_max then
    update public.task_devices
    set status = 'queued',
        retry_count = cur_retry + 1,
        error = error_text,
        last_error_at = now(),
        lease_expires_at = null,
        claimed_by_pc_id = null,
        updated_at = now()
    where id = task_device_id;

    return query select 'queued'::text, cur_retry + 1;
  else
    update public.task_devices
    set status = 'failed',
        retry_count = cur_retry + 1,
        error = error_text,
        last_error_at = now(),
        completed_at = now(),
        lease_expires_at = null,
        updated_at = now()
    where id = task_device_id;

    return query select 'failed'::text, cur_retry + 1;
  end if;
end $$;
