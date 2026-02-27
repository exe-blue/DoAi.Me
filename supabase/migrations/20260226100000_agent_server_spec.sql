-- Agent ↔ 서버 통신 명세(알파) 반영: task_queue.target_worker, commands 테이블, pcs/devices 확장
-- Supabase 유지, Realtime 구독용 컬럼/테이블 추가

-- ═══ task_queue: target_worker (명세 4.4 - filter target_worker=eq.${pcNumber}) ═══
ALTER TABLE task_queue ADD COLUMN IF NOT EXISTS target_worker TEXT;
COMMENT ON COLUMN task_queue.target_worker IS '대상 PC 식별자 (예: PC01). NULL이면 큐 디스패처가 임의 배정';

CREATE INDEX IF NOT EXISTS idx_task_queue_target_worker_queued
  ON task_queue (target_worker, priority DESC, created_at ASC)
  WHERE status = 'queued';

-- ═══ commands: 즉시 명령 Realtime 구독 (명세 4.2, 4.4) ═══
CREATE TABLE IF NOT EXISTS commands (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  target_worker TEXT         NOT NULL,
  payload       JSONB        NOT NULL DEFAULT '{}',
  status        TEXT         NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  result        JSONB
);

COMMENT ON TABLE commands IS '즉시 명령 (서버/대시보드 → Agent). Realtime INSERT 구독으로 Agent가 수신';
COMMENT ON COLUMN commands.target_worker IS '대상 PC (예: PC01)';

CREATE INDEX IF NOT EXISTS idx_commands_target_worker_pending
  ON commands (target_worker, created_at)
  WHERE status = 'pending';

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commands;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══ pcs: 하트비트 명세 포맷 (agent_version, system) ═══
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS agent_version TEXT;
ALTER TABLE pcs ADD COLUMN IF NOT EXISTS system JSONB;
COMMENT ON COLUMN pcs.agent_version IS 'Agent 버전 (예: 0.1.0-alpha)';
COMMENT ON COLUMN pcs.system IS '하트비트 system 블록: cpu_usage, memory_free_mb, adb_server_ok, usb_devices_count, uptime_seconds';

-- ═══ devices: device_code (명세 4.3 - device_code "PC01-001") ═══
ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_code TEXT;
COMMENT ON COLUMN devices.device_code IS '기기 식별 코드 (예: PC01-001). 하트비트 명세용';
