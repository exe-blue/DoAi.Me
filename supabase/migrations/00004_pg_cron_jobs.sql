-- DoAi.Me v2.1 - pg_cron 스케줄 작업
-- 주기적 유지보수 작업 등록
--
-- 의존성: pg_cron (Supabase Pro 이상, 또는 self-hosted)

-- ============================================================
-- 1. pg_cron 확장 활성화
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- pg_cron은 기본적으로 'postgres' DB에서만 작동
-- Supabase에서는 이미 설정되어 있음

-- ============================================================
-- 2. 오래된 task_logs 정리 (30일 이상)
--    매일 새벽 3시 (UTC) 실행
-- ============================================================
SELECT cron.schedule(
  'cleanup-old-task-logs',
  '0 3 * * *',
  $$
    DELETE FROM public.task_logs
    WHERE created_at < now() - INTERVAL '30 days';
  $$
);

-- ============================================================
-- 3. 비정상 워커 감지 (5분 이상 heartbeat 없음 → offline)
--    매 2분마다 실행
-- ============================================================
SELECT cron.schedule(
  'mark-stale-workers-offline',
  '*/2 * * * *',
  $$
    UPDATE public.workers
    SET status = 'offline',
        xiaowei_connected = false
    WHERE status = 'online'
      AND last_heartbeat < now() - INTERVAL '5 minutes';
  $$
);

-- ============================================================
-- 4. 멈춘 태스크 정리 (1시간 이상 running → failed)
--    매 10분마다 실행
-- ============================================================
SELECT cron.schedule(
  'reset-stuck-tasks',
  '*/10 * * * *',
  $$
    UPDATE public.tasks
    SET status = 'failed',
        error = 'Task stuck: exceeded 1 hour running time',
        completed_at = now()
    WHERE status = 'running'
      AND started_at < now() - INTERVAL '1 hour';
  $$
);

-- ============================================================
-- 5. 완료된 태스크 아카이브 (90일 이상 → 삭제)
--    매주 일요일 새벽 4시 (UTC) 실행
-- ============================================================
SELECT cron.schedule(
  'archive-old-tasks',
  '0 4 * * 0',
  $$
    DELETE FROM public.tasks
    WHERE status IN ('completed', 'failed')
      AND completed_at < now() - INTERVAL '90 days';
  $$
);

-- ============================================================
-- 6. 오프라인 디바이스 정리 (7일 이상 미접속)
--    매일 새벽 3시 30분 (UTC) 실행
-- ============================================================
SELECT cron.schedule(
  'cleanup-stale-devices',
  '30 3 * * *',
  $$
    UPDATE public.devices
    SET status = 'offline'
    WHERE status != 'offline'
      AND last_seen < now() - INTERVAL '7 days';
  $$
);

-- ============================================================
-- 확인용 쿼리:
--   SELECT * FROM cron.job ORDER BY jobname;
--
-- 등록된 작업 목록:
--   1. cleanup-old-task-logs     : 매일 03:00 UTC - 30일 이상 로그 삭제
--   2. mark-stale-workers-offline: 매 2분 - 비정상 워커 offline 처리
--   3. reset-stuck-tasks         : 매 10분 - 1시간 이상 stuck 태스크 실패 처리
--   4. archive-old-tasks         : 매주 일 04:00 UTC - 90일 이상 완료 태스크 삭제
--   5. cleanup-stale-devices     : 매일 03:30 UTC - 7일 이상 미접속 디바이스 offline
-- ============================================================
