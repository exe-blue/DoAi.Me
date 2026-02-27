-- Step 7: 최종 검증 (Supabase SQL Editor에서 직접 실행)
-- MCP execute_sql 권한 없으면 SQL Editor에서 실행
-- 기대 결과: devices_columns=7, ja_columns=2, function=1, views=2

SELECT 'devices_columns' AS check_type,
    COUNT(*) AS result
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'devices'
  AND column_name IN (
    'task_status', 'current_assignment_id', 'current_video_title',
    'watch_progress', 'consecutive_errors', 'daily_watch_count', 'daily_watch_seconds'
  )

UNION ALL

SELECT 'ja_columns',
    COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'job_assignments'
  AND column_name IN ('pc_id', 'video_id')

UNION ALL

SELECT 'function',
    COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'claim_next_assignment'

UNION ALL

SELECT 'views',
    COUNT(*)
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('dashboard_summary', 'video_progress');
