-- DoAi.Me v2.1 - Broadcast Triggers for system_events + workers
-- system_events INSERT → room:system, workers UPDATE → room:workers
--
-- 의존성: broadcast_to_channel() (00003_realtime_broadcast.sql)

-- ============================================================
-- 1. system_events 트리거 → room:system Broadcast
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_system_event_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payload JSONB;
  _event   TEXT;
BEGIN
  _event := lower(TG_OP);  -- 'insert', 'update', 'delete'

  IF TG_OP = 'DELETE' THEN
    _payload := jsonb_build_object(
      'type',   'delete',
      'record', to_jsonb(OLD)
    );
  ELSE
    _payload := jsonb_build_object(
      'type',      _event,
      'record',    to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    );
  END IF;

  PERFORM public.broadcast_to_channel('room:system', _event, _payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_system_event_broadcast ON system_events;
CREATE TRIGGER trg_system_event_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON system_events
  FOR EACH ROW
  EXECUTE FUNCTION public.on_system_event_broadcast();

-- ============================================================
-- 2. workers 트리거 → room:workers Broadcast
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_worker_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payload JSONB;
  _event   TEXT;
BEGIN
  _event := lower(TG_OP);

  IF TG_OP = 'DELETE' THEN
    _payload := jsonb_build_object(
      'type',   'delete',
      'record', to_jsonb(OLD)
    );
  ELSE
    _payload := jsonb_build_object(
      'type',      _event,
      'record',    to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    );
  END IF;

  PERFORM public.broadcast_to_channel('room:workers', _event, _payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_worker_broadcast ON workers;
CREATE TRIGGER trg_worker_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION public.on_worker_broadcast();

-- ============================================================
-- 적용 후 확인:
--   SELECT trigger_name, event_object_table
--   FROM information_schema.triggers
--   WHERE trigger_schema = 'public'
--     AND trigger_name IN ('trg_system_event_broadcast', 'trg_worker_broadcast');
-- ============================================================
