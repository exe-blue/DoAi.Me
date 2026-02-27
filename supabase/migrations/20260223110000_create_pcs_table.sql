-- pcs 테이블 생성 (Agent/대시보드용 노드 PC 식별)
-- 20260223120000_fix_dashboard_summary_view.sql, 20260225100000_job_assignments_pc_video_claim.sql,
-- 20260226100000_agent_server_spec.sql 보다 선행 실행되어야 함.

CREATE TABLE IF NOT EXISTS pcs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  pc_number       TEXT         NOT NULL UNIQUE,
  status          TEXT         NOT NULL DEFAULT 'offline',
  last_heartbeat  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE pcs IS '노드 PC (Agent 호스트). pc_number 예: PC00, PC01.';
COMMENT ON COLUMN pcs.pc_number IS 'PC 식별자 (^PC[0-9]{2}$ 권장)';
COMMENT ON COLUMN pcs.last_heartbeat IS 'Agent 하트비트 최종 시각';

-- devices.pc_id: 이 PC에 소속된 기기 (대시보드 뷰/claim_next_assignment에서 사용)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pc_id UUID REFERENCES pcs(id) ON DELETE SET NULL;
COMMENT ON COLUMN devices.pc_id IS '소속 노드 PC (pcs.id). Agent가 하트비트 시 설정';

CREATE INDEX IF NOT EXISTS idx_devices_pc_id ON devices(pc_id);
