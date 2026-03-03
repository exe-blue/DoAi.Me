-- Secure invoke_app_schedule_endpoint function
-- Revoke PUBLIC access and grant only to postgres role (which pg_cron runs as)
--
-- This prevents any DB user from invoking internal admin endpoints via the stored scheduler secret.

REVOKE ALL ON FUNCTION public.invoke_app_schedule_endpoint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_app_schedule_endpoint(text) TO postgres;
