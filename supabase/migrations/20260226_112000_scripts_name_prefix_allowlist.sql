-- scripts.name: prefix allowlist (yt/, device/, ops/) + slash-path regex + unique
-- 거부 예: misc/test, YT/preflight, yt//watch, yt/

-- 0) name 유니크 (없으면 추가)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scripts_name_unique') then
    alter table public.scripts
      add constraint scripts_name_unique unique (name);
  end if;
end $$;

-- 1) 슬래시 경로형 강제 (2+ 세그먼트)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scripts_name_path_check') then
    alter table public.scripts
      add constraint scripts_name_path_check
      check (name ~ '^[a-z0-9][a-z0-9_-]*/[a-z0-9][a-z0-9_-]*(/[a-z0-9][a-z0-9_-]*)*$');
  end if;
end $$;

-- 2) 최상위 prefix allowlist 강제: yt/, device/, ops/만 허용
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scripts_name_prefix_allowlist') then
    alter table public.scripts
      add constraint scripts_name_prefix_allowlist
      check (
        name like 'yt/%'
        or name like 'device/%'
        or name like 'ops/%'
      );
  end if;
end $$;

create index if not exists idx_scripts_name_version
  on public.scripts(name, version desc);
