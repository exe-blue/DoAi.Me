-- preset_commands: 대시보드에서 등록, Agent에서 폴링하여 실행
-- Agent: apps/desktop/src/agent/scheduling/preset-command-poller.js

CREATE TABLE IF NOT EXISTS preset_commands (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pc_id      TEXT         NOT NULL,
  preset     TEXT         NOT NULL,
  serial     TEXT,
  status     TEXT         NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result     JSONB
);

COMMENT ON TABLE preset_commands IS 'Preset 명령 대기열. pc_id=PC번호 또는 ALL; Agent가 status=pending 조회 후 실행';
CREATE INDEX IF NOT EXISTS idx_preset_commands_status_created ON preset_commands(status, created_at);
CREATE INDEX IF NOT EXISTS idx_preset_commands_pc_id ON preset_commands(pc_id);
