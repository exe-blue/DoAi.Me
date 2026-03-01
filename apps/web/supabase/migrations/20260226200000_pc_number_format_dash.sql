-- PC 번호 포맷 변경: PC00 → PC-00, PC01 → PC-01, ...
-- WORKER_NAME 폐기, PC_NUMBER 단일 식별자로 통일.

UPDATE pcs
SET pc_number = 'PC-' || SUBSTRING(pc_number FROM 3)
WHERE pc_number ~ '^PC\d{2}$';

-- task_queue.target_worker, commands.target_worker도 같은 포맷 사용
UPDATE task_queue
SET target_worker = 'PC-' || SUBSTRING(target_worker FROM 3)
WHERE target_worker ~ '^PC\d{2}$';

UPDATE commands
SET target_worker = 'PC-' || SUBSTRING(target_worker FROM 3)
WHERE target_worker IS NOT NULL AND target_worker ~ '^PC\d{2}$';

-- 코멘트 갱신
COMMENT ON COLUMN pcs.pc_number IS 'PC 식별자 (PC-XX 형식, 예: PC-00, PC-01)';
COMMENT ON COLUMN task_queue.target_worker IS '대상 PC 식별자 (예: PC-01). NULL이면 큐 디스패처가 임의 배정';
COMMENT ON COLUMN commands.target_worker IS '대상 PC (예: PC-01)';
