-- Architecture vulnerability fix: Late-join policy A (Phase 3.2, 6)
-- Add new device to current task only when task is pending (not running), to avoid late-join timeout failures.

CREATE OR REPLACE FUNCTION public.fn_add_task_device_for_new_device()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _task_id UUID;
  _cfg JSONB;
BEGIN
  -- Current pending task only (do not add to running task = policy A)
  SELECT id INTO _task_id
  FROM tasks
  WHERE status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF _task_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (
    SELECT 1 FROM task_devices
    WHERE task_id = _task_id AND device_serial = NEW.serial
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _cfg := public.fn_build_task_device_config(_task_id);

  INSERT INTO task_devices (task_id, device_serial, status, config, worker_id, pc_id)
  VALUES (
    _task_id,
    NEW.serial,
    'pending',
    _cfg,
    COALESCE(NEW.worker_id, NEW.pc_id),
    NEW.pc_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.fn_add_task_device_for_new_device() IS
  'When a new device is inserted, add one task_device only for current pending task (policy A: no late-join to running).';
