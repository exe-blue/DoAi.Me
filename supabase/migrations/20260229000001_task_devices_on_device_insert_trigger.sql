-- When a new device is added, if there is a current pending/running task, add one task_device for that device.

CREATE OR REPLACE FUNCTION public.fn_build_task_device_config(_task_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  _t RECORD;
  _video RECORD;
  _payload JSONB;
BEGIN
  SELECT video_id, payload INTO _t FROM tasks WHERE id = _task_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN '{}'::JSONB;
  END IF;
  _payload := COALESCE(_t.payload, '{}'::JSONB);

  SELECT title, duration_sec, watch_duration_min_pct, watch_duration_max_pct, prob_like, prob_comment
  INTO _video
  FROM videos
  WHERE id = _t.video_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'video_url', 'https://www.youtube.com/watch?v=' || COALESCE(_t.video_id::TEXT, ''),
    'video_id', _t.video_id,
    'title', _video.title,
    'keyword', COALESCE(_video.title, ''),
    'duration_sec', _video.duration_sec,
    'min_wait_sec', COALESCE((_payload->>'waitMinSec')::INT, 1),
    'max_wait_sec', COALESCE((_payload->>'waitMaxSec')::INT, 5),
    'watch_min_pct', COALESCE(_video.watch_duration_min_pct, (_payload->>'watchMinPct')::INT, 20),
    'watch_max_pct', COALESCE(_video.watch_duration_max_pct, (_payload->>'watchMaxPct')::INT, 95),
    'prob_like', COALESCE(_video.prob_like, (_payload->>'likeProb')::INT, 40),
    'prob_comment', COALESCE(_video.prob_comment, (_payload->>'commentProb')::INT, 10),
    'prob_playlist', COALESCE((_payload->>'saveProb')::INT, 5)
  );
END;
$$;

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
  -- Current pending/running task (single active task)
  SELECT id INTO _task_id
  FROM tasks
  WHERE status IN ('pending', 'running')
  ORDER BY created_at DESC
  LIMIT 1;

  IF _task_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Skip if this device already has a task_device for this task
  IF EXISTS (
    SELECT 1 FROM task_devices
    WHERE task_id = _task_id AND device_serial = NEW.serial
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _cfg := public.fn_build_task_device_config(_task_id);

  INSERT INTO task_devices (task_id, device_serial, status, config, worker_id)
  VALUES (
    _task_id,
    NEW.serial,
    'pending',
    _cfg,
    COALESCE(NEW.worker_id, NEW.pc_id)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_add_task_device_for_new_device ON devices;
CREATE TRIGGER trg_add_task_device_for_new_device
  AFTER INSERT ON devices
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_add_task_device_for_new_device();

COMMENT ON FUNCTION public.fn_add_task_device_for_new_device() IS
  'When a new device is inserted, add one task_device for current pending/running task if any.';
