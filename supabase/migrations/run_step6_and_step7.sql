-- ============================================================
-- Step 6 + Step 7: Supabase SQL Editor에서 전체 선택 후 실행
-- ============================================================

-- ----- Step 6: video_progress View -----
ALTER TABLE videos ADD COLUMN IF NOT EXISTS target_views INTEGER DEFAULT 100;

DROP VIEW IF EXISTS video_progress;

CREATE VIEW video_progress AS
SELECT
    v.id,
    v.title,
    v.channel_id,
    COALESCE(v.target_views, 100) AS target_views,
    v.status,
    COUNT(ja.id) FILTER (WHERE ja.status = 'completed')::bigint AS completed,
    COUNT(ja.id) FILTER (WHERE ja.status = 'running')::bigint AS running,
    COUNT(ja.id) FILTER (WHERE ja.status = 'pending')::bigint AS pending,
    COUNT(ja.id) FILTER (WHERE ja.status = 'failed')::bigint AS failed,
    CASE
        WHEN COALESCE(v.target_views, 0) > 0
        THEN ROUND(
            COUNT(ja.id) FILTER (WHERE ja.status = 'completed')::numeric
            / COALESCE(v.target_views, 100) * 100,
            1
        )
        ELSE 0
    END::numeric(5,1) AS progress_pct
FROM videos v
LEFT JOIN job_assignments ja ON ja.video_id = v.id
WHERE v.status = 'active'
GROUP BY v.id, v.title, v.channel_id, v.target_views, v.status;

-- ----- Step 7: 최종 검증 (기대: devices_columns=7, ja_columns=2, function=1, views=2) -----
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
