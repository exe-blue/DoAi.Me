-- execution_logs: device-level execution history (Layer 3 logging).
-- Agent inserts via supabase-sync insertExecutionLog(); used for run_task_device start/completed/failed.

CREATE TABLE IF NOT EXISTS execution_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id  TEXT         NOT NULL,
  device_id     TEXT,
  status        TEXT         NOT NULL DEFAULT 'completed'
                             CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  data          JSONB,
  details       JSONB,
  level         TEXT         NOT NULL DEFAULT 'info'
                             CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  message       TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE execution_logs IS 'Layer 3: per task_device execution logs (start, completed, failed).';
CREATE INDEX IF NOT EXISTS idx_execution_logs_execution_id ON execution_logs (execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at ON execution_logs (created_at DESC);
