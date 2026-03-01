-- 계정 비밀번호 저장 (보안)
-- Supabase Vault 연동 권장. 임시로 encrypted_password 컬럼 사용.
-- 프로덕션에서는 pgsodium 또는 Vault secret reference로 교체.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password_encrypted TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS recovery_phone TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS login_method TEXT DEFAULT 'manual';

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- job_assignments에 스크린샷 경로 컬럼 추가
ALTER TABLE job_assignments ADD COLUMN IF NOT EXISTS screenshot_path TEXT;
