-- devices.connection_id: OTG/WiFi connection identifier (e.g. IP:5555)
-- When device is connected via TCP/IP, Xiaowei uses this as target; USB uses serial.
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS connection_id TEXT;
COMMENT ON COLUMN public.devices.connection_id IS 'Xiaowei connection identifier (e.g. 192.168.1.100:5555 for OTG). NULL for USB. Used as device_target = connection_id ?? serial.';

CREATE INDEX IF NOT EXISTS idx_devices_connection_id ON public.devices(connection_id)
  WHERE connection_id IS NOT NULL;
