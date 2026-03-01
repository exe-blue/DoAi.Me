-- Add worker_id and device_id to proxies table
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS worker_id uuid REFERENCES workers(id) ON DELETE SET NULL;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES devices(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS proxies_device_id_unique ON proxies(device_id) WHERE device_id IS NOT NULL;
