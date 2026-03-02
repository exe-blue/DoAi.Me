-- Align devices table with docs/deployment-database-manager-handoff.md
-- Agent expects: serial_number (unique for upsert onConflict), pc_id, last_heartbeat.
-- If the DB only has serial / last_seen (from 00001_initial_schema), this adds and backfills.

-- 1) serial_number: add and backfill from serial
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS serial_number TEXT;

UPDATE public.devices
SET serial_number = serial
WHERE serial_number IS NULL AND serial IS NOT NULL;

COMMENT ON COLUMN public.devices.serial_number IS 'Device identifier for agent upsert (onConflict). Synced from serial if present.';

-- 2) Unique constraint on serial_number for upsert onConflict (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.devices'::regclass AND conname = 'uq_devices_serial_number'
  ) THEN
    -- Require non-null for unique; avoid breaking if some rows still have null serial_number
    CREATE UNIQUE INDEX IF NOT EXISTS uq_devices_serial_number
      ON public.devices(serial_number)
      WHERE serial_number IS NOT NULL;
  END IF;
END $$;

-- 3) last_heartbeat: add and backfill from last_seen
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ;

UPDATE public.devices
SET last_heartbeat = last_seen
WHERE last_heartbeat IS NULL AND last_seen IS NOT NULL;

COMMENT ON COLUMN public.devices.last_heartbeat IS 'Last agent heartbeat (used by agent). Synced from last_seen if present.';

-- 4) Index for agent queries filtering by pc_id + serial_number (if not exists)
CREATE INDEX IF NOT EXISTS idx_devices_serial_number ON public.devices(serial_number);
CREATE INDEX IF NOT EXISTS idx_devices_last_heartbeat ON public.devices(last_heartbeat);
