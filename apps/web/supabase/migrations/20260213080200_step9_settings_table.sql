-- STEP 9: Settings table for dynamic agent configuration
-- Run in Supabase SQL Editor

-- 1. Create settings table (if not exists)
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,             -- JSON-encoded value string
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable Realtime on settings table (agent subscribes to UPDATE events)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_settings_updated_at();

-- 4. Seed default settings (upsert — won't overwrite existing values)
INSERT INTO settings (key, value, description) VALUES
  ('heartbeat_interval',       '30000',                'Heartbeat interval in ms'),
  ('adb_reconnect_interval',   '60000',                'ADB reconnect interval in ms'),
  ('proxy_check_interval',     '300000',               'Proxy check loop interval in ms'),
  ('proxy_policy',             '"sticky"',             'Proxy policy: sticky | rotate_on_failure | rotate_daily'),
  ('max_concurrent_tasks',     '20',                   'Max concurrent tasks per worker'),
  ('device_interval',          '500',                  'Delay between devices in ms'),
  ('watch_duration',           '[30, 120]',            'Watch duration range [min, max] seconds'),
  ('task_interval',            '[1000, 3000]',         'Task interval range [min, max] ms'),
  ('max_retry_count',          '3',                    'Max retry count for failed tasks'),
  ('log_retention_days',       '7',                    'Task log retention in days'),
  ('command_log_retention_days','30',                   'Command log retention in days')
ON CONFLICT (key) DO NOTHING;

-- Verify
SELECT key, value, description FROM settings ORDER BY key;
