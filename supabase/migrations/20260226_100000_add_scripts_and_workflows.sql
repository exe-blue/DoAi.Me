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

create table if not exists public.workflows_definitions (
  id text not null,
  version int not null,
  kind text not null check (kind in ('MAIN','MAINTENANCE','EVENT')),
  name text not null,
  is_active boolean not null default true,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflows_definitions_pkey primary key (id, version)
);

create index if not exists idx_workflows_definitions_id on public.workflows_definitions(id);
create index if not exists idx_workflows_definitions_active on public.workflows_definitions(is_active);
