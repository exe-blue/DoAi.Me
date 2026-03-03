-- Schedule sync-channels and dispatch-queue via Supabase pg_cron.
-- This replaces Vercel cron configuration.
--
-- Required Vault secrets:
--   - app_base_url: e.g. https://your-domain.com
--   - app_schedule_secret: Shared secret used as Authorization Bearer token for /api/cron/* endpoints
--     This value must match the APP_SCHEDULE_SECRET environment variable in the web app.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.invoke_app_schedule_endpoint(p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _base_url text;
  _jwt text;
BEGIN
  SELECT decrypted_secret INTO _base_url
    FROM vault.decrypted_secrets
   WHERE name = 'app_base_url'
   LIMIT 1;

  SELECT decrypted_secret INTO _jwt
    FROM vault.decrypted_secrets
   WHERE name = 'app_schedule_secret'
   LIMIT 1;

  IF _base_url IS NULL OR _jwt IS NULL THEN
    RAISE WARNING '[invoke_app_schedule_endpoint] app_base_url or app_schedule_secret not configured';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(_base_url, '/') || p_path,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _jwt
    ),
    body := '{}'::jsonb
  );
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-channels-every-minute') THEN
    PERFORM cron.unschedule('sync-channels-every-minute');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'dispatch-queue-every-minute') THEN
    PERFORM cron.unschedule('dispatch-queue-every-minute');
  END IF;

  PERFORM cron.schedule(
    'sync-channels-every-minute',
    '* * * * *',
    $$SELECT public.invoke_app_schedule_endpoint('/api/cron/sync-channels');$$
  );

  PERFORM cron.schedule(
    'dispatch-queue-every-minute',
    '* * * * *',
    $$SELECT public.invoke_app_schedule_endpoint('/api/cron/dispatch-queue');$$
  );
END $$;
