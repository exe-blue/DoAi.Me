-- 한 대가 먼저 시청을 끝내면, 같은 task에 대해 "시작하지 않은" 한 대를 추가한다.
-- task_devices.status가 completed/done으로 바뀔 때 1건의 pending 행을 추가해 동시 시청 수를 유지.

CREATE OR REPLACE FUNCTION public.fn_refill_task_device_on_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task_status TEXT;
  _config JSONB;
  _worker_id UUID;
BEGIN
  -- 완료로 바뀐 경우만 처리 (pending/running -> done|completed)
  IF (OLD.status IS NOT DISTINCT FROM 'done' OR OLD.status IS NOT DISTINCT FROM 'completed') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NEW.status IS DISTINCT FROM 'done' AND NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- task가 이미 완료/실패/취소된 경우 리필하지 않음
  SELECT status INTO _task_status FROM tasks WHERE id = NEW.task_id;
  IF _task_status IN ('completed', 'done', 'failed', 'cancelled') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _config := COALESCE(NEW.config, '{}'::JSONB);
  _worker_id := NEW.worker_id;

  -- 시작하지 않은 한 대 추가 (동일 task_id, 새 device_serial, pending)
  INSERT INTO task_devices (task_id, device_serial, status, config, worker_id)
  VALUES (
    NEW.task_id,
    'refill_' || gen_random_uuid()::text,
    'pending',
    _config,
    _worker_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.fn_refill_task_device_on_complete() IS
  '한 대가 완료되면 같은 task에 pending 1건 추가해 동시 시청 수 유지';

DROP TRIGGER IF EXISTS trg_refill_task_device_on_complete ON task_devices;
CREATE TRIGGER trg_refill_task_device_on_complete
  AFTER UPDATE ON task_devices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_refill_task_device_on_complete();
