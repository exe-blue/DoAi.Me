-- Architecture vulnerability fix: prevent overlapping sync runs (Phase 2.3)
-- Advisory lock so only one runSyncChannels runs at a time (at-least-once cron safety).

CREATE OR REPLACE FUNCTION public.try_sync_lock()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Lock id 0x5ync = 0x53796e63 = 1399873891 (arbitrary bigint)
  RETURN pg_try_advisory_lock(1399873891);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sync_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_unlock(1399873891);
END;
$$;

COMMENT ON FUNCTION public.try_sync_lock() IS 'Acquire sync lock; returns true if acquired. Call release_sync_lock() when done.';
COMMENT ON FUNCTION public.release_sync_lock() IS 'Release sync lock after runSyncChannels.';
