-- DoAi.Me v2.1 - Task Progress Sync Trigger
-- task_devices INSERT/UPDATE 시 tasks.devices_done / devices_failed 자동 갱신
--
-- 의존성: tasks 테이블 (devices_done, devices_failed 컬럼 필수)
--         task_devices 테이블

-- ============================================================
-- 1. 트리거 함수: task_devices 변경 → tasks 카운트 동기화
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
  -- INSERT/UPDATE 시 NEW, DELETE 시 OLD 참조
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

-- ============================================================
-- 2. 트리거 생성 (INSERT, UPDATE, DELETE 모두 대응)
-- ============================================================
DROP TRIGGER IF EXISTS trg_sync_task_progress ON task_devices;
CREATE TRIGGER trg_sync_task_progress
  AFTER INSERT OR UPDATE OR DELETE ON task_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_sync_task_progress();
