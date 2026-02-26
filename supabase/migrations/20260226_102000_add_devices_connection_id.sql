-- devices.connection_id: Xiaowei 연결 식별자 (OTG/WiFi 타겟, e.g. IP:5555)
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS connection_id TEXT;

CREATE INDEX IF NOT EXISTS idx_devices_connection_id ON public.devices(connection_id);

COMMENT ON COLUMN public.devices.connection_id IS 'Xiaowei connection identifier (e.g. 192.168.1.100:5555). NULL for USB. device_target = connection_id ?? serial.';
