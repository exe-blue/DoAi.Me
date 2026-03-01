-- STEP 12: Task Queue & Scheduled Tasks
-- Creates task_queue for priority-based dispatch and task_schedules for cron-like automation.

-- ═══ task_queue ═══
CREATE TABLE IF NOT EXISTS task_queue (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  task_config   JSONB        NOT NULL,
  priority      INTEGER      NOT NULL DEFAULT 0,
  status        TEXT         NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'dispatched', 'cancelled')),
  dispatched_task_id UUID    REFERENCES tasks(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  dispatched_at TIMESTAMPTZ
);

COMMENT ON TABLE task_queue IS 'Priority queue for auto-dispatch. Higher priority = dispatched first.';
COMMENT ON COLUMN task_queue.task_config IS 'Task creation payload (same shape as POST /api/tasks body)';
COMMENT ON COLUMN task_queue.status IS 'queued → dispatched | cancelled';

-- Partial index for efficient dequeue (only queued items, ordered by priority DESC then FIFO)
CREATE INDEX IF NOT EXISTS idx_task_queue_priority
  ON task_queue (priority DESC, created_at ASC)
  WHERE status = 'queued';

-- Enable realtime for task_queue
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_queue;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══ task_schedules ═══
CREATE TABLE IF NOT EXISTS task_schedules (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT         NOT NULL,
  cron_expression TEXT         NOT NULL,
  task_config     JSONB        NOT NULL,
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,
  run_count       INTEGER      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE task_schedules IS 'Cron-like schedules that auto-enqueue tasks into task_queue.';
COMMENT ON COLUMN task_schedules.cron_expression IS 'Standard 5-field cron: minute hour day-of-month month day-of-week';
COMMENT ON COLUMN task_schedules.next_run_at IS 'Precomputed next fire time (updated after each run)';

-- Partial index for efficient schedule evaluation
CREATE INDEX IF NOT EXISTS idx_task_schedules_next
  ON task_schedules (next_run_at ASC)
  WHERE is_active = true;

-- Enable realtime for task_schedules
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_schedules;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
