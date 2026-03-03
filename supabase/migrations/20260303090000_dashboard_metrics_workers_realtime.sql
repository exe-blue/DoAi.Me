-- Workers-based dashboard KPI aggregate table for realtime subscriptions.

CREATE TABLE IF NOT EXISTS public.dashboard_metrics (
  key TEXT PRIMARY KEY,
  devices_total INTEGER NOT NULL DEFAULT 0,
  devices_online INTEGER NOT NULL DEFAULT 0,
  devices_busy INTEGER NOT NULL DEFAULT 0,
  devices_offline INTEGER NOT NULL DEFAULT 0,
  devices_error INTEGER NOT NULL DEFAULT 0,
  workers_total INTEGER NOT NULL DEFAULT 0,
  workers_online INTEGER NOT NULL DEFAULT 0,
  workers_error INTEGER NOT NULL DEFAULT 0,
  last_worker_heartbeat TIMESTAMPTZ,
  worker_heartbeat_stale INTEGER NOT NULL DEFAULT 0,
  error_count_24h INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.dashboard_metrics IS 'Realtime dashboard KPI aggregate rows (single row key=global).';

CREATE OR REPLACE FUNCTION public.refresh_dashboard_metrics()
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  _devices_total INTEGER := 0;
  _devices_online INTEGER := 0;
  _devices_busy INTEGER := 0;
  _devices_offline INTEGER := 0;
  _devices_error INTEGER := 0;
  _workers_total INTEGER := 0;
  _workers_online INTEGER := 0;
  _workers_error INTEGER := 0;
  _last_worker_heartbeat TIMESTAMPTZ := NULL;
  _worker_heartbeat_stale INTEGER := 0;
  _error_count_24h INTEGER := 0;
BEGIN
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'online')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'busy')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'offline')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'error')::INTEGER
  INTO
    _devices_total,
    _devices_online,
    _devices_busy,
    _devices_offline,
    _devices_error
  FROM public.devices;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE status = 'online')::INTEGER,
    COUNT(*) FILTER (WHERE status = 'error')::INTEGER,
    MAX(last_heartbeat),
    COUNT(*) FILTER (
      WHERE last_heartbeat IS NULL
         OR last_heartbeat < now() - INTERVAL '2 minutes'
    )::INTEGER
  INTO
    _workers_total,
    _workers_online,
    _workers_error,
    _last_worker_heartbeat,
    _worker_heartbeat_stale
  FROM public.workers;

  SELECT COUNT(*)::INTEGER
  INTO _error_count_24h
  FROM public.task_logs
  WHERE created_at >= now() - INTERVAL '24 hours'
    AND level IN ('error', 'fatal');

  INSERT INTO public.dashboard_metrics (
    key,
    devices_total,
    devices_online,
    devices_busy,
    devices_offline,
    devices_error,
    workers_total,
    workers_online,
    workers_error,
    last_worker_heartbeat,
    worker_heartbeat_stale,
    error_count_24h,
    updated_at
  )
  VALUES (
    'global',
    COALESCE(_devices_total, 0),
    COALESCE(_devices_online, 0),
    COALESCE(_devices_busy, 0),
    COALESCE(_devices_offline, 0),
    COALESCE(_devices_error, 0),
    COALESCE(_workers_total, 0),
    COALESCE(_workers_online, 0),
    COALESCE(_workers_error, 0),
    _last_worker_heartbeat,
    COALESCE(_worker_heartbeat_stale, 0),
    COALESCE(_error_count_24h, 0),
    now()
  )
  ON CONFLICT (key) DO UPDATE
  SET
    devices_total = EXCLUDED.devices_total,
    devices_online = EXCLUDED.devices_online,
    devices_busy = EXCLUDED.devices_busy,
    devices_offline = EXCLUDED.devices_offline,
    devices_error = EXCLUDED.devices_error,
    workers_total = EXCLUDED.workers_total,
    workers_online = EXCLUDED.workers_online,
    workers_error = EXCLUDED.workers_error,
    last_worker_heartbeat = EXCLUDED.last_worker_heartbeat,
    worker_heartbeat_stale = EXCLUDED.worker_heartbeat_stale,
    error_count_24h = EXCLUDED.error_count_24h,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_dashboard_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_dashboard_metrics();
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_dashboard_metrics_workers ON public.workers;
CREATE TRIGGER trg_refresh_dashboard_metrics_workers
AFTER INSERT OR UPDATE OR DELETE ON public.workers
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_refresh_dashboard_metrics();

DROP TRIGGER IF EXISTS trg_refresh_dashboard_metrics_devices ON public.devices;
CREATE TRIGGER trg_refresh_dashboard_metrics_devices
AFTER INSERT OR UPDATE OR DELETE ON public.devices
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_refresh_dashboard_metrics();

DROP TRIGGER IF EXISTS trg_refresh_dashboard_metrics_task_logs ON public.task_logs;
CREATE TRIGGER trg_refresh_dashboard_metrics_task_logs
AFTER INSERT OR UPDATE OR DELETE ON public.task_logs
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_refresh_dashboard_metrics();

-- Seed initial snapshot row.
SELECT public.refresh_dashboard_metrics();

-- Enable postgres_changes subscription on aggregate table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'dashboard_metrics'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dashboard_metrics;
  END IF;
END $$;
