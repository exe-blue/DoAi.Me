-- preset_commands 테이블: 웹 → Agent 명령 큐
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS preset_commands (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pc_id TEXT NOT NULL,
    serial TEXT,                              -- null 또는 'all' = 해당 PC 전체 디바이스
    preset TEXT NOT NULL,                     -- 'scan' | 'optimize' | 'yttest' | 'warmup' | 'init' | 'install_apks'
    status TEXT DEFAULT 'pending',            -- 'pending' | 'running' | 'completed' | 'failed'
    options JSONB DEFAULT '{}',
    result JSONB,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by TEXT DEFAULT 'web'
);

-- Agent 폴링용 인덱스
CREATE INDEX IF NOT EXISTS idx_preset_commands_pending 
    ON preset_commands (pc_id, status) 
    WHERE status = 'pending';

-- 오래된 명령 자동 정리 (30일)
-- CREATE POLICY 등은 필요 시 추가
