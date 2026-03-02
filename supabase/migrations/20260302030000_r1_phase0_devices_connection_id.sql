-- R1 Phase 0 (3/5): devices.connection_id + 보조 인덱스
-- idempotent

-- Xiaowei 연결 식별자 (IP:PORT 또는 NULL=USB). agent resolves: connection_id ?? serial
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS connection_id TEXT;

COMMENT ON COLUMN public.devices.connection_id IS
  'Xiaowei 연결 대상 식별자 (예: 192.168.1.100:5555). NULL이면 USB serial 사용. device_target = connection_id ?? serial.';

CREATE INDEX IF NOT EXISTS idx_devices_connection_id
  ON public.devices(connection_id)
  WHERE connection_id IS NOT NULL;

-- pc_id 인덱스 (claim RPC 내부 join 최적화)
CREATE INDEX IF NOT EXISTS idx_devices_pc_id
  ON public.devices(pc_id)
  WHERE pc_id IS NOT NULL;

-- serial 인덱스 (이미 UNIQUE일 수 있으나 혹시 없을 경우 대비)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'devices' AND indexname = 'idx_devices_serial'
  ) THEN
    CREATE INDEX idx_devices_serial ON public.devices(serial);
  END IF;
END $$;
