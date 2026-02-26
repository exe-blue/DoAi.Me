-- Priority system: source (manual vs channel_auto) + priority (1-10) + FIFO
-- manual always before channel_auto; then priority DESC; then created_at ASC.

-- task_queue: add source column
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'task_queue' AND column_name = 'source'
  ) THEN
    ALTER TABLE task_queue
    ADD COLUMN source TEXT NOT NULL DEFAULT 'channel_auto'
    CHECK (source IN ('manual', 'channel_auto'));
    COMMENT ON COLUMN task_queue.source IS 'manual = direct registration (content page), channel_auto = channel sync';
  END IF;
END $$;

-- Index for dequeue order: manual first, then priority DESC, created_at ASC
DROP INDEX IF EXISTS idx_task_queue_priority;
CREATE INDEX IF NOT EXISTS idx_task_queue_dequeue
  ON task_queue (
    (CASE WHEN source = 'manual' THEN 0 ELSE 1 END),
    priority DESC,
    created_at ASC
  )
  WHERE status = 'queued';

-- tasks: add source column (for UI badges)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'source'
  ) THEN
    ALTER TABLE tasks
    ADD COLUMN source TEXT
    CHECK (source IS NULL OR source IN ('manual', 'channel_auto'));
    COMMENT ON COLUMN tasks.source IS 'manual = from content page, channel_auto = from channel sync/schedule';
  END IF;
END $$;

-- videos: add source column (for channel sheet [자동]/[직접] tag)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'videos' AND column_name = 'source'
  ) THEN
    ALTER TABLE videos
    ADD COLUMN source TEXT
    CHECK (source IS NULL OR source IN ('manual', 'channel_auto'));
    COMMENT ON COLUMN videos.source IS 'manual = direct registration, channel_auto = from channel sync';
  END IF;
END $$;
