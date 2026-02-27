-- 프로덕션 최소: scripts 테이블만 신설 (workflows는 기존 테이블 재활용, CREATE 하지 않음)
create table if not exists public.scripts (
  id uuid not null default gen_random_uuid(),
  name text not null,
  version int not null,
  status text not null default 'draft'
    check (status in ('draft','active','archived')),
  type text not null default 'javascript'
    check (type in ('javascript','adb_shell')),
  content text not null,
  timeout_ms int not null default 180000,
  params_schema jsonb not null default '{}'::jsonb,
  default_params jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scripts_pkey primary key (id, version)
);

create index if not exists idx_scripts_name on public.scripts(name);
create index if not exists idx_scripts_status on public.scripts(status);
