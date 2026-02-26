-- 규칙: 영상 < 기기 우선. 한 대가 끝나면 "대기열(다음 영상)에 남아있는 디바이스" 중 하나를
-- 현재 시청 중인 영상 태스크로 재배정. 없을 때만 새 리필 행을 INSERT.

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
  _pc_id UUID;
  _stolen_id UUID;
  _updated INT;
BEGIN
  -- 완료로 바뀐 경우만 처리 (pending/running -> done|completed)
  IF (OLD.status IS NOT DISTINCT FROM 'done' OR OLD.status IS NOT DISTINCT FROM 'completed') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NEW.status IS DISTINCT FROM 'done' AND NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _pc_id := COALESCE(OLD.pc_id, NEW.pc_id);
  IF _pc_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT status INTO _task_status FROM tasks WHERE id = NEW.task_id;
  IF _task_status IN ('completed', 'done', 'failed', 'cancelled') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _config := COALESCE(NEW.config, '{}'::JSONB);
  _worker_id := NEW.worker_id;

  -- 1) 우선: 같은 PC에서 "다른 태스크(다음 대기 영상)"에 걸려 있는 pending 디바이스 하나를
  --    현재 시청 중인 영상(이 태스크)으로 재배정. (기기 모두가 한 영상을 보는 게 우선)
  SELECT td.id INTO _stolen_id
  FROM task_devices td
  JOIN tasks t ON t.id = td.task_id
  WHERE td.pc_id = _pc_id
    AND td.task_id != NEW.task_id
    AND td.status = 'pending'
    AND t.status IN ('pending', 'running')
  ORDER BY t.created_at ASC
  LIMIT 1;

  IF _stolen_id IS NOT NULL THEN
    UPDATE task_devices
    SET task_id = NEW.task_id, config = _config
    WHERE id = _stolen_id;
    GET DIAGNOSTICS _updated = ROW_COUNT;
    IF _updated > 0 THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  -- 2) 재배정할 대기열 디바이스가 없을 때만: 같은 PC에 새 pending 1건 추가 (기존 리필)
  INSERT INTO task_devices (task_id, device_serial, status, config, worker_id, pc_id)
  VALUES (
    NEW.task_id,
    'refill_' || gen_random_uuid()::text,
    'pending',
    _config,
    _worker_id,
    _pc_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.fn_refill_task_device_on_complete() IS
  '한 대 완료 시: 1) 같은 PC의 다른 태스크(다음 대기 영상) pending 1건을 이 태스크로 재배정, 2) 없으면 새 pending 1건 추가. 영상<기기 우선.';
