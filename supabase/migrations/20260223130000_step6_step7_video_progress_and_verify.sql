-- Step 6: video_progress View (Supabase SQL Editor에서 실행)
-- MCP: apply_migration/execute_sql 시 "permission" 또는 "project reference" 오류 시 SQL Editor 사용
-- videos.target_views 없으면 먼저 추가
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
