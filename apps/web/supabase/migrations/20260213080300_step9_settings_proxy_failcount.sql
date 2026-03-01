-- STEP 9: Settings table + proxy fail_count column

-- 1. Create settings table
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Enable Realtime on settings table (for agent config sync)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Seed default settings
INSERT INTO settings (key, value, description) VALUES
  ('heartbeat_interval',         '30000',               'Heartbeat interval in ms'),
  ('adb_reconnect_interval',     '60000',               'ADB reconnect check interval in ms'),
  ('proxy_check_interval',       '300000',              'Proxy validation check interval in ms (5 min)'),
  ('proxy_policy',               '"sticky"',            'Proxy assignment policy: sticky | rotate_on_failure | rotate_daily'),
  ('max_concurrent_tasks',       '20',                  'Max concurrent tasks per worker'),
  ('device_interval',            '500',                 'Interval between device commands in ms'),
  ('watch_duration',             '[30, 120]',           'Watch duration range [min, max] in seconds'),
  ('task_interval',              '[1000, 3000]',        'Task interval range [min, max] in ms'),
  ('max_retry_count',            '3',                   'Max retry count for failed tasks'),
  ('log_retention_days',         '7',                   'task_logs cleanup threshold in days'),
  ('command_log_retention_days', '30',                  'command_logs cleanup threshold in days')
ON CONFLICT (key) DO NOTHING;

-- 3. Add fail_count column to proxies
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS fail_count INTEGER DEFAULT 0;

-- 4. Add username/password columns to proxies (for auth proxies)
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS password TEXT;
