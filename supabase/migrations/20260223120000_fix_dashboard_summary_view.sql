-- Step 5 수정: view column 타입을 기존(bigint)과 동일하게 유지
-- "cannot change data type of view column total_watches_today from bigint to integer" 오류 해결

CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
    p.pc_number,
    p.id as pc_id,
    COUNT(d.id) as total_devices,
    COUNT(*) FILTER (WHERE d.task_status = 'watching') as watching,
    COUNT(*) FILTER (WHERE d.task_status = 'idle') as idle,
    COUNT(*) FILTER (WHERE d.task_status = 'free_watch') as free_watch,
    COUNT(*) FILTER (WHERE d.task_status = 'searching') as searching,
    COUNT(*) FILTER (WHERE d.task_status IN ('error', 'quarantined')) as errors,
    COALESCE(SUM(d.daily_watch_count), 0)::bigint as total_watches_today,
    COALESCE(SUM(d.daily_watch_seconds), 0)::bigint as total_seconds_today
FROM pcs p
LEFT JOIN devices d ON d.pc_id = p.id
GROUP BY p.id, p.pc_number;
