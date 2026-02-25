-- 태스크 실행/리필을 PC 단위로 한정: task_devices에 pc_id 추가.
-- 20대 상한·한대 끝나면 한대 추가 규칙은 PC 안에서만 적용되며, 다른 PC가 가져가거나 리필하지 않음.

-- 1. task_devices.pc_id 추가 (어느 PC 소속인지)
ALTER TABLE task_devices ADD COLUMN IF NOT EXISTS pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL;
COMMENT ON COLUMN task_devices.pc_id IS '해당 행이 배정된 PC. 태스크/리필은 PC별로만 운영되며 다른 PC가 가져가지 않음.';

CREATE INDEX IF NOT EXISTS idx_task_devices_pc_id ON task_devices(pc_id);
CREATE INDEX IF NOT EXISTS idx_task_devices_task_pc_status ON task_devices(task_id, pc_id, status);

-- 2. 리필 트리거 수정: 같은 PC로만 리필 (pc_id가 있을 때만 리필, 새 행에 OLD.pc_id 복사)
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
BEGIN
  -- 완료로 바뀐 경우만 처리 (pending/running -> done|completed)
  IF (OLD.status IS NOT DISTINCT FROM 'done' OR OLD.status IS NOT DISTINCT FROM 'completed') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NEW.status IS DISTINCT FROM 'done' AND NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- PC 단위 가드레일: pc_id가 없으면 리필하지 않음 (다른 PC가 가져가지 않도록)
  _pc_id := COALESCE(OLD.pc_id, NEW.pc_id);
  IF _pc_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- task가 이미 완료/실패/취소된 경우 리필하지 않음
  SELECT status INTO _task_status FROM tasks WHERE id = NEW.task_id;
  IF _task_status IN ('completed', 'done', 'failed', 'cancelled') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _config := COALESCE(NEW.config, '{}'::JSONB);
  _worker_id := NEW.worker_id;

  -- 같은 PC에 대해 시작하지 않은 한 대만 추가 (다른 PC에서 불러오지 않음)
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
  '한 대가 완료되면 같은 PC에만 pending 1건 추가. PC 단위 가드레일 적용.';
