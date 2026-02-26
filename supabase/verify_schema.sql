-- ============================================================
-- DoAi.Me v2.1 - Schema Deployment Verification
-- Supabase SQL Editor에서 실행
-- 각 섹션을 개별 실행하거나 전체를 한번에 실행
-- ============================================================

-- ============================================================
-- 1. 테이블 존재 확인 (expected: 11개)
--    workers, devices, accounts, presets, tasks, task_logs,
--    proxies, channels, videos, schedules + (추가 테이블)
-- ============================================================
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type IN ('BASE TABLE', 'VIEW')
ORDER BY table_type, table_name;

-- ============================================================
-- 2. ENUM 타입 확인 (expected: 12개)
--    task_type, task_status, log_level 등
-- ============================================================
SELECT
  t.typname AS enum_name,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS enum_values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON t.typnamespace = n.oid
WHERE t.typtype = 'e'
  AND n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- ============================================================
-- 3. 트리거 확인
--    expected: trg_task_broadcast, trg_task_log_broadcast + broadcast 트리거들
-- ============================================================
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- ============================================================
-- 4. 함수 확인 (public 스키마)
-- ============================================================
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  CASE p.provolatile
    WHEN 'v' THEN 'volatile'
    WHEN 's' THEN 'stable'
    WHEN 'i' THEN 'immutable'
  END AS volatility,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname NOT LIKE 'pg_%'
ORDER BY p.proname;

-- ============================================================
-- 5. pg_cron 잡 확인 (expected: 5~7개)
--    cleanup-old-task-logs, mark-stale-workers-offline,
--    reset-stuck-tasks, archive-old-tasks, cleanup-stale-devices
-- ============================================================
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
ORDER BY jobname;

-- ============================================================
-- 6. Realtime Publication 확인
--    schema_patch_broadcast.sql 적용 후: 비어있거나
--    또는 tasks, task_logs, workers, devices 등록됨
-- ============================================================
SELECT
  schemaname,
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;

-- ============================================================
-- 7. RLS 정책 확인
-- ============================================================
SELECT
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================================
-- 8. Seed 데이터 확인
-- ============================================================

-- 8a. 프리셋 (expected: 14개)
SELECT
  name,
  type,
  COALESCE(config->>'category', '(no category)') AS category
FROM presets
ORDER BY type, name;

-- 8b. 워커 (expected: 5대)
SELECT
  hostname,
  COALESCE(ip_local, '(not set)') AS ip_local,
  status,
  device_count
FROM workers
ORDER BY hostname;

-- ============================================================
-- 9. Vault 시크릿 확인
--    supabase_url, supabase_service_role_key 설정 필요
-- ============================================================
SELECT
  name,
  CASE
    WHEN decrypted_secret IS NOT NULL THEN 'SET (' || length(decrypted_secret) || ' chars)'
    ELSE 'NOT SET'
  END AS status
FROM vault.decrypted_secrets
WHERE name IN ('supabase_url', 'supabase_service_role_key')
ORDER BY name;

-- ============================================================
-- 10. Broadcast 트리거 함수 확인
--     broadcast_to_channel, on_task_broadcast, on_task_log_broadcast
-- ============================================================
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (p.proname LIKE '%broadcast%' OR p.proname LIKE 'on_task%')
ORDER BY p.proname;

-- ============================================================
-- 11. 인덱스 확인
-- ============================================================
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;

-- ============================================================
-- 12. 확장 모듈 확인 (pg_net, pg_cron, supabase_vault)
-- ============================================================
SELECT
  extname,
  extversion,
  n.nspname AS schema
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE extname IN ('pg_net', 'pg_cron', 'supabase_vault', 'pgjwt', 'pgcrypto')
ORDER BY extname;

-- ============================================================
-- SUMMARY: 카운트 요약 (한눈에 확인)
-- ============================================================
SELECT 'Tables' AS check_item,
  (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'BASE TABLE')::text AS actual,
  '11' AS expected
UNION ALL
SELECT 'Views',
  (SELECT count(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_type = 'VIEW')::text,
  '4'
UNION ALL
SELECT 'ENUM types',
  (SELECT count(*) FROM pg_type t
   JOIN pg_namespace n ON t.typnamespace = n.oid
   WHERE t.typtype = 'e' AND n.nspname = 'public')::text,
  '12'
UNION ALL
SELECT 'Triggers',
  (SELECT count(DISTINCT trigger_name) FROM information_schema.triggers
   WHERE trigger_schema = 'public')::text,
  '5+'
UNION ALL
SELECT 'Functions',
  (SELECT count(*) FROM pg_proc p
   JOIN pg_namespace n ON p.pronamespace = n.oid
   WHERE n.nspname = 'public' AND p.proname NOT LIKE 'pg_%')::text,
  '3+'
UNION ALL
SELECT 'pg_cron jobs',
  (SELECT count(*) FROM cron.job)::text,
  '5~7'
UNION ALL
SELECT 'Realtime pub tables',
  (SELECT count(*) FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime')::text,
  '0 or 4'
UNION ALL
SELECT 'RLS policies',
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public')::text,
  '0+'
UNION ALL
SELECT 'Presets (seed)',
  (SELECT count(*) FROM presets)::text,
  '14'
UNION ALL
SELECT 'Workers (seed)',
  (SELECT count(*) FROM workers)::text,
  '5'
UNION ALL
SELECT 'Vault secrets',
  (SELECT count(*) FROM vault.decrypted_secrets
   WHERE name IN ('supabase_url', 'supabase_service_role_key'))::text,
  '2'
UNION ALL
SELECT 'Extensions (pg_net, pg_cron)',
  (SELECT count(*) FROM pg_extension
   WHERE extname IN ('pg_net', 'pg_cron'))::text,
  '2'
ORDER BY check_item;
