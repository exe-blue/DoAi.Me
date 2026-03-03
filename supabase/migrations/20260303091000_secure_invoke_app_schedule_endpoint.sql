-- Secure invoke_app_schedule_endpoint function
-- Revoke PUBLIC access and grant only to postgres role (which pg_cron runs as)
--
-- This prevents any DB user from invoking internal admin endpoints via the stored scheduler secret.

-- Verify function exists before revoking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'invoke_app_schedule_endpoint'
    AND pg_get_function_identity_arguments(p.oid) = 'p_path text'
  ) THEN
    RAISE EXCEPTION 'Function public.invoke_app_schedule_endpoint(text) not found - migration cannot proceed';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.invoke_app_schedule_endpoint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_app_schedule_endpoint(text) TO postgres;
