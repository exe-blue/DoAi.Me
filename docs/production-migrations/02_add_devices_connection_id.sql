-- 프로덕션: devices.connection_id (Xiaowei 타겟: connection_id ?? serial)
alter table public.devices
  add column if not exists connection_id text;

create index if not exists idx_devices_connection_id on public.devices(connection_id);
create index if not exists idx_devices_pc_id on public.devices(pc_id);
-- serial_number 또는 serial 중 존재하는 컬럼에만 인덱스 생성 (프로덕션 스키마 차이 대응)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='devices' and column_name='serial_number') then
    create index if not exists idx_devices_serial_number on public.devices(serial_number);
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='devices' and column_name='serial') then
    create index if not exists idx_devices_serial on public.devices(serial);
  end if;
end $$;
