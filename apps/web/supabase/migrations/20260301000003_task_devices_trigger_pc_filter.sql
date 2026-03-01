-- Architecture vulnerability fix: PC별 1개 (Phase 0.6, 8.2)
-- Create task_devices only for devices on PCs that do not already have pending/running task_devices.

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
  SELECT title, duration_sec, watch_duration_min_pct, watch_duration_max_pct, prob_like, prob_comment
  INTO _video
  FROM videos
  WHERE id = NEW.video_id
  LIMIT 1;

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

  -- Exclude devices on PCs that already have pending/running task_devices (PC별 1개)
  INSERT INTO task_devices (task_id, device_serial, status, config, worker_id, pc_id)
  SELECT
    NEW.id,
    d.serial,
    'pending',
    _cfg,
    COALESCE(d.worker_id, d.pc_id),
    d.pc_id
  FROM devices d
  WHERE (NEW.worker_id IS NULL OR d.pc_id = NEW.worker_id OR d.worker_id = NEW.worker_id)
    AND d.pc_id IS NOT NULL
    AND d.pc_id NOT IN (
      SELECT DISTINCT COALESCE(td.pc_id, td.claimed_by_pc_id)
      FROM task_devices td
      WHERE td.status IN ('pending', 'running')
        AND (td.pc_id IS NOT NULL OR td.claimed_by_pc_id IS NOT NULL)
    )
  ORDER BY d.serial
  LIMIT _limit;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_create_task_devices_on_task_insert() IS
  'Layer 3: after tasks INSERT, create task_devices for devices on non-busy PCs only (PC별 1개).';
