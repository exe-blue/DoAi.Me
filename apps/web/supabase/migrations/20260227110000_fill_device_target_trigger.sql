-- Auto-fill device_target on task_devices INSERT from devices.ip_address
-- Also resets existing failed records caused by null device_target

-- Reset failed task_devices where error = 'No device target'
-- Uses host() to strip CIDR /32 from inet type (e.g. 192.168.1.1/32 → 192.168.1.1)
UPDATE task_devices td
SET
  device_target  = host(d.ip_address) || ':5555',
  status         = 'pending',
  error          = NULL,
  attempt        = 0,
  started_at     = NULL,
  completed_at   = NULL,
  updated_at     = NOW()
FROM devices d
WHERE td.device_id = d.id
  AND td.status = 'failed'
  AND td.error LIKE '%No device target%';

-- Trigger function: auto-fill device_target before insert if not provided
-- Uses host() to avoid CIDR notation from inet::text cast
CREATE OR REPLACE FUNCTION public.fill_device_target()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.device_target IS NULL AND NEW.device_id IS NOT NULL THEN
    SELECT host(ip_address) || ':5555'
    INTO NEW.device_target
    FROM devices
    WHERE id = NEW.device_id
      AND ip_address IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_device_target ON task_devices;
CREATE TRIGGER trg_fill_device_target
  BEFORE INSERT ON task_devices
  FOR EACH ROW
  EXECUTE FUNCTION fill_device_target();
