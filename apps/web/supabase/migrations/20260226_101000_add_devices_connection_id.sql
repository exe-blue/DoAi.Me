alter table public.devices
  add column if not exists connection_id text;

create index if not exists idx_devices_connection_id on public.devices(connection_id);
create index if not exists idx_devices_pc_id on public.devices(pc_id);
create index if not exists idx_devices_serial_number on public.devices(serial_number);
