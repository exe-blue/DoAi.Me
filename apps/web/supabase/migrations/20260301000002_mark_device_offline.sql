-- Architecture vulnerability fix: offline device cascade (Phase 0.4, 7)
-- When a device goes offline, roll back its claimed/running task_devices to pending.

CREATE OR REPLACE FUNCTION public.mark_device_offline(p_device_serial TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1) Mark device offline (use 'serial' column; agents sync with serial_number/serial)
  UPDATE devices
  SET status = 'offline',
      updated_at = now()
  WHERE serial = p_device_serial OR serial_number = p_device_serial;

  -- 2) Roll back this device's claimed/running task_devices to pending so others can claim
  UPDATE task_devices
  SET status = 'pending',
      claimed_by_pc_id = NULL,
      lease_expires_at = NULL,
      started_at = NULL,
      error = 'device_offline_rollback'
  WHERE device_serial = p_device_serial
    AND status IN ('claimed', 'running');
END;
$$;

COMMENT ON FUNCTION public.mark_device_offline(TEXT) IS
  'Set device offline and roll back its claimed/running task_devices to pending (zombie cleanup).';

-- Optional: system_config for offline threshold (Phase 0.5)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'system_config') THEN
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  END IF;
  INSERT INTO system_config (key, value) VALUES ('offline_threshold', '3 minutes')
  ON CONFLICT (key) DO NOTHING;
END $$;
