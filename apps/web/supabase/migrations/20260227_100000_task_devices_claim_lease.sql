-- task_devices SSOT + claim/lease RPC
-- Release 1 core

-- 1) enum이 없으면 text로 처리. (이미 task_status enum이 있더라도 task_devices는 별도)
-- 상태: pending / running / completed / failed / cancelled

create table if not exists public.task_devices (
  id uuid primary key default gen_random_uuid(),

  -- 관제용 task(상위)
  task_id uuid not null references public.tasks(id) on delete cascade,

  -- 소속 PC (실행할 PC)
  pc_id uuid not null references public.pcs(id) on delete restrict,

  -- 대상 디바이스 (1행=1디바이스 실행)
  device_id uuid not null references public.devices(id) on delete restrict,

  -- 실행 타겟 (Xiaowei devices 필드로 넘길 값)
  -- connection_id ?? serial_number 를 스냅샷으로 저장해두면 실행 시 조회 비용 감소
  device_target text,

  status text not null default 'pending'
    check (status in ('pending','running','completed','failed','cancelled')),

  -- claim/lease
  claimed_by_pc_id uuid references public.pcs(id) on delete set null,
  lease_expires_at timestamptz,

  -- retry
  attempt integer not null default 0,
  max_attempts integer not null default 3,

  -- snapshot (정의→실행 복사본)
  config jsonb not null default '{}'::jsonb,

  -- result / error
  result jsonb default '{}'::jsonb,
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- 2) 동일 task에서 동일 device 중복 방지
create unique index if not exists ux_task_devices_task_device
  on public.task_devices(task_id, device_id);

-- 3) 클레임 대상 조회 최적화 인덱스
create index if not exists idx_task_devices_claim
  on public.task_devices(pc_id, status, lease_expires_at);

create index if not exists idx_task_devices_claimed
  on public.task_devices(claimed_by_pc_id, status, lease_expires_at);

-- 4) updated_at 자동 갱신 트리거 (있으면 재사용)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_task_devices_updated_at on public.task_devices;
create trigger trg_task_devices_updated_at
before update on public.task_devices
for each row execute function public.set_updated_at();

-- =========================
-- RPC: claim / lease / complete / fail_or_retry
-- =========================

-- A) claim: 원자적으로 pending 중에서 lease 만료(또는 null)인 것 N개를 잡아온다.
create or replace function public.claim_task_devices_for_pc(
  runner_pc_id uuid,
  max_to_claim integer default 10,
  lease_minutes integer default 5
)
returns setof public.task_devices
language plpgsql
as $$
begin
  return query
  with candidates as (
    select td.id
    from public.task_devices td
    where td.pc_id = runner_pc_id
      and td.status = 'pending'
      and (td.lease_expires_at is null or td.lease_expires_at < now())
    order by td.created_at asc
    limit max_to_claim
    for update skip locked
  ),
  updated as (
    update public.task_devices td
    set status = 'running',
        claimed_by_pc_id = runner_pc_id,
        lease_expires_at = now() + make_interval(mins => lease_minutes),
        started_at = coalesce(td.started_at, now()),
        attempt = td.attempt + 1
    where td.id in (select id from candidates)
    returning td.*
  )
  select * from updated;
end $$;

-- B) renew lease: 실행 중인 작업 연장
create or replace function public.renew_task_device_lease(
  task_device_id uuid,
  runner_pc_id uuid,
  lease_minutes integer default 5
)
returns public.task_devices
language plpgsql
as $$
declare
  row public.task_devices;
begin
  update public.task_devices td
  set lease_expires_at = now() + make_interval(mins => lease_minutes)
  where td.id = task_device_id
    and td.claimed_by_pc_id = runner_pc_id
    and td.status = 'running'
  returning * into row;

  return row;
end $$;

-- C) complete
create or replace function public.complete_task_device(
  task_device_id uuid,
  runner_pc_id uuid,
  result_json jsonb default '{}'::jsonb
)
returns public.task_devices
language plpgsql
as $$
declare
  row public.task_devices;
begin
  update public.task_devices td
  set status = 'completed',
      result = coalesce(result_json, '{}'::jsonb),
      completed_at = now(),
      lease_expires_at = null
  where td.id = task_device_id
    and td.claimed_by_pc_id = runner_pc_id
    and td.status = 'running'
  returning * into row;

  return row;
end $$;

-- D) fail or retry
create or replace function public.fail_or_retry_task_device(
  task_device_id uuid,
  runner_pc_id uuid,
  error_text text,
  max_attempts_override integer default null
)
returns public.task_devices
language plpgsql
as $$
declare
  row public.task_devices;
begin
  update public.task_devices td
  set error = error_text,
      lease_expires_at = null,
      status = case
        when td.attempt < coalesce(max_attempts_override, td.max_attempts) then 'pending'
        else 'failed'
      end,
      completed_at = case
        when td.attempt < coalesce(max_attempts_override, td.max_attempts) then null
        else now()
      end
  where td.id = task_device_id
    and td.claimed_by_pc_id = runner_pc_id
    and td.status = 'running'
  returning * into row;

  return row;
end $$;
