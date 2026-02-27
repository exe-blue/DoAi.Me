-- E2E 파이프라인 진단용 쿼리 (Supabase SQL Editor에서 단계별 실행)
-- Run in order: Step 1 → interpret → Step 2 or 3 → Step 4 as needed

-- ========== Step 1: job_assignments에 pending이 있는지 ==========
SELECT
    ja.id,
    ja.pc_id,
    ja.video_id,
    ja.device_serial,
    ja.status,
    ja.created_at
FROM job_assignments ja
WHERE ja.status = 'pending'
ORDER BY ja.created_at DESC
LIMIT 20;

-- ========== Step 2: VideoDispatcher 진단 ==========
-- 최근 jobs
SELECT id, title, video_title, keyword, target_url, is_active, created_at
FROM jobs
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC LIMIT 10;

-- 최근 job_assignments (status별 count)
SELECT
    ja.status,
    COUNT(*) AS cnt,
    MAX(ja.created_at) AS latest
FROM job_assignments ja
WHERE ja.created_at > now() - interval '1 hour'
GROUP BY ja.status;

-- ========== Step 3: PC UUID 확인 후 claim_next_assignment 테스트 ==========
SELECT id, pc_number FROM pcs WHERE pc_number = 'PC00';

-- (위에서 나온 id를 사용) 예: '5da8272e-f28c-4893-b21f-c2bbe5b8c885'
-- SELECT * FROM claim_next_assignment('5da8272e-f28c-4893-b21f-c2bbe5b8c885'::uuid, 'test_serial');

-- ========== Step 4: pc_id 일치 확인 ==========
SELECT
    ja.pc_id AS assignment_pc_id,
    p.id AS pcs_id,
    p.pc_number,
    ja.status,
    COUNT(*)
FROM job_assignments ja
LEFT JOIN pcs p ON ja.pc_id = p.id
GROUP BY ja.pc_id, p.id, p.pc_number, ja.status
LIMIT 20;

-- ========== device_id NOT NULL 확인 ==========
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'job_assignments'
  AND column_name IN ('device_id', 'pc_id', 'video_id', 'device_serial');

-- ========== 수동 pending 1건 생성 (Orchestrator 동작 검증용) ==========
-- PC00 UUID와 job/devices/videos 존재 시 실행. 3초 내 Agent 로그에 [Orchestrator] claim 나와야 함.
-- device_id: migration 20260225110000 적용 후 NULL 가능.
/*
INSERT INTO job_assignments (job_id, device_id, device_serial, pc_id, video_id, status)
VALUES (
  (SELECT id FROM jobs WHERE is_active = true LIMIT 1),
  (SELECT id FROM devices WHERE pc_id = (SELECT id FROM pcs WHERE pc_number = 'PC00' LIMIT 1) LIMIT 1),  -- or NULL after migration
  NULL,
  (SELECT id FROM pcs WHERE pc_number = 'PC00' LIMIT 1),
  (SELECT id FROM videos WHERE status = 'active' LIMIT 1),
  'pending'
);
*/
