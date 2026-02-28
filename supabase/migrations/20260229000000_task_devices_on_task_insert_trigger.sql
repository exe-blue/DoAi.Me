-- Layer 3: task_devices are created server-side when a task is inserted.
-- One row per registered device (up to task.device_count), config from task.payload + videos.

CREATE OR REPLACE FUNCTION public.fn_create_task_devices_on_task_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _video RECORD;
  _payload JSONB := COALESCE(NEW.payload, '{}'::JSONB);
  _cfg JSONB;
  _limit INT := GREATEST(COALESCE(NEW.device_count, 20), 0);
BEGIN
  -- Load video row for config (videos.id = YouTube video ID)
  SELECT title, duration_sec, watch_duration_min_pct, watch_duration_max_pct, prob_like, prob_comment
  INTO _video
  FROM videos
  WHERE id = NEW.video_id
  LIMIT 1;

  -- Build base config from task payload + video
  _cfg := jsonb_build_object(
    'video_url', 'https://www.youtube.com/watch?v=' || COALESCE(NEW.video_id::TEXT, ''),
    'video_id', NEW.video_id,
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

  -- Insert one task_device per device (by worker/pc if task.worker_id set, else all devices)
  INSERT INTO task_devices (task_id, device_serial, status, config, worker_id)
  SELECT
    NEW.id,
    d.serial,
    'pending',
    _cfg,
    COALESCE(d.worker_id, d.pc_id)
  FROM devices d
  WHERE (NEW.worker_id IS NULL OR d.pc_id = NEW.worker_id OR d.worker_id = NEW.worker_id)
  ORDER BY d.serial
  LIMIT _limit;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_task_devices_on_task_insert ON tasks;
CREATE TRIGGER trg_create_task_devices_on_task_insert
  AFTER INSERT ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_create_task_devices_on_task_insert();

COMMENT ON FUNCTION public.fn_create_task_devices_on_task_insert() IS
  'Layer 3: after tasks INSERT, create task_devices for each registered device (config from task.payload + videos).';
