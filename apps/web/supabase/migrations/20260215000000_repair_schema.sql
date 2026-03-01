-- DoAi.Me - Schema repair for restored/partial DB
-- Run after initial_schema + channels/videos/schedules.
-- Creates missing tables (task_devices, system_events) and adds missing columns.
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ============================================================
-- 1. ENUMs (create only if not exist)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('available', 'in_use', 'cooldown', 'banned', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.device_connection_mode AS ENUM ('usb', 'wifi', 'otg', 'accessibility', 'cloud');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.device_status AS ENUM ('online', 'offline', 'busy', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.log_level AS ENUM ('debug', 'info', 'warn', 'error', 'fatal');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.preset_type AS ENUM ('action', 'script', 'adb', 'composite');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.proxy_status AS ENUM ('active', 'inactive', 'banned', 'testing');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.proxy_type AS ENUM ('http', 'https', 'socks5');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM (
    'pending', 'assigned', 'running', 'done', 'failed', 'cancelled', 'timeout', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.task_type AS ENUM ('preset', 'adb', 'direct', 'batch', 'youtube');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.worker_status AS ENUM ('online', 'offline', 'error');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. task_devices (referenced by 00005, pipeline, agent)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  device_serial TEXT NOT NULL,
  worker_id     UUID REFERENCES workers(id) ON DELETE SET NULL,
  status        TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  duration_ms   INT,
  error         TEXT,
  result        JSONB,
  retry_count   INT,
  xiaowei_action  TEXT,
  xiaowei_code    INT,
  xiaowei_request JSONB,
  xiaowei_response JSONB,
  created_at    TIMESTAMPTZ DEFAULT now(),
  progress      INT DEFAULT 0,
  config        JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_task_devices_task_device
  ON task_devices(task_id, device_serial)
  WHERE task_id IS NOT NULL AND device_serial IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_devices_task ON task_devices(task_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_task_status ON task_devices(task_id, status);

-- ============================================================
-- 3. system_events (referenced by 00006 broadcast)
-- ============================================================
CREATE TABLE IF NOT EXISTS system_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id     UUID REFERENCES workers(id) ON DELETE SET NULL,
  device_serial TEXT,
  event_type    TEXT NOT NULL,
  message       TEXT,
  metadata      JSONB,
  severity      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_events_worker ON system_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);

-- ============================================================
-- 4. tasks - missing columns
-- ============================================================
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS devices_done INT DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS devices_failed INT DEFAULT 0;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS devices_total INT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_count INT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS repeat_interval_ms INT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_tag TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS timeout_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS title TEXT;

-- ============================================================
-- 5. task_logs - missing columns
-- ============================================================
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS task_device_id UUID REFERENCES task_devices(id) ON DELETE SET NULL;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS source TEXT;

-- ============================================================
-- 6. devices - missing columns (00001 has current_task, proxy; types use current_task_id, proxy_id)
-- ============================================================
ALTER TABLE devices ADD COLUMN IF NOT EXISTS current_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS proxy_id UUID REFERENCES proxies(id) ON DELETE SET NULL;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS android_version TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_charging BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS battery_level INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_screenshot TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mirror_height INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS mirror_width INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS screen_on BOOLEAN;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS sort_order INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS source_height INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS source_width INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_free_mb INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS tag_group TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS total_errors INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS total_tasks INT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS xiaowei_connect_time TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS xiaowei_serial TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS youtube_version TEXT;

-- ============================================================
-- 7. accounts - missing columns
-- ============================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS worker_id UUID REFERENCES workers(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ban_reason TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_year INT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS recovery_email TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS task_count INT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- 8. presets - missing columns
-- ============================================================
ALTER TABLE presets ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS estimated_duration_ms INT;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS fail_count INT DEFAULT 0;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS parameters_schema JSONB;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS requires_account BOOLEAN;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS requires_proxy BOOLEAN;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS run_count INT DEFAULT 0;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS sort_order INT;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS success_count INT DEFAULT 0;
ALTER TABLE presets ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE presets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- 9. proxies - missing columns
-- ============================================================
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS fail_count INT DEFAULT 0;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS max_devices INT;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS provider TEXT;
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS username TEXT;
-- Do not store proxy password in cleartext. Use Supabase Vault and reference by password_secret_id.
ALTER TABLE proxies ADD COLUMN IF NOT EXISTS password_secret_id TEXT;

-- ============================================================
-- 10. workers - missing columns
-- ============================================================
ALTER TABLE workers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ============================================================
-- 11. fn_sync_task_progress (task_devices -> tasks.devices_done/devices_failed)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_task_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task_id UUID;
  _done    INT;
  _failed  INT;
BEGIN
  _task_id := COALESCE(NEW.task_id, OLD.task_id);

  SELECT
    COALESCE(SUM(CASE WHEN status IN ('done', 'completed') THEN 1 ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)
  INTO _done, _failed
  FROM task_devices
  WHERE task_id = _task_id;

  UPDATE tasks
  SET devices_done   = _done,
      devices_failed = _failed
  WHERE id = _task_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_progress ON task_devices;
CREATE TRIGGER trg_sync_task_progress
  AFTER INSERT OR UPDATE OR DELETE ON task_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_task_progress();
