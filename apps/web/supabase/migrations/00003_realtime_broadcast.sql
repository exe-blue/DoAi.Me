-- DoAi.Me v2.1 - Realtime Broadcast + Vault + pg_net
-- tasks / task_logs 변경 시 Broadcast 채널로 실시간 전송
--
-- 의존성: pg_net (HTTP from DB), supabase_vault (시크릿 관리)

-- ============================================================
-- 1. 확장 활성화
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
-- supabase_vault는 Supabase 프로젝트에 기본 포함됨

-- ============================================================
-- 2. Realtime Publication 등록
--    postgres_changes 리스너가 작동하려면 필수
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE task_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE workers;
ALTER PUBLICATION supabase_realtime ADD TABLE devices;

-- ============================================================
-- 3. Broadcast 헬퍼 함수
--    Vault에서 시크릿을 읽어 Realtime Broadcast API 호출
-- ============================================================
CREATE OR REPLACE FUNCTION public.broadcast_to_channel(
  p_channel TEXT,
  p_event   TEXT,
  p_payload JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _url  TEXT;
  _key  TEXT;
BEGIN
  -- Vault에서 시크릿 읽기
  SELECT decrypted_secret INTO _url
    FROM vault.decrypted_secrets
   WHERE name = 'supabase_url'
   LIMIT 1;

  SELECT decrypted_secret INTO _key
    FROM vault.decrypted_secrets
   WHERE name = 'supabase_service_role_key'
   LIMIT 1;

  -- Vault 미설정 시 current_setting 폴백
  IF _url IS NULL THEN
    _url := current_setting('app.supabase_url', true);
  END IF;
  IF _key IS NULL THEN
    _key := current_setting('app.supabase_service_role_key', true);
  END IF;

  -- 둘 다 없으면 조용히 종료 (로그만)
  IF _url IS NULL OR _key IS NULL THEN
    RAISE WARNING '[broadcast_to_channel] supabase_url or service_role_key not configured';
    RETURN;
  END IF;

  -- Realtime Broadcast API 호출
  PERFORM net.http_post(
    url     := _url || '/realtime/v1/api/broadcast',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        _key,
      'Authorization', 'Bearer ' || _key
    ),
    body := jsonb_build_object(
      'messages', jsonb_build_array(
        jsonb_build_object(
          'topic',   'realtime:' || p_channel,
          'event',   p_event,
          'payload', p_payload
        )
      )
    )
  );
END;
$$;

-- ============================================================
-- 4. tasks 트리거 → room:tasks Broadcast
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_task_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _payload JSONB;
  _event   TEXT;
BEGIN
  _event := lower(TG_OP);  -- 'insert', 'update', 'delete'

  IF TG_OP = 'DELETE' THEN
    _payload := jsonb_build_object(
      'type',   'delete',
      'record', to_jsonb(OLD)
    );
  ELSE
    _payload := jsonb_build_object(
      'type',      _event,
      'record',    to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
    );
  END IF;

  PERFORM public.broadcast_to_channel('room:tasks', _event, _payload);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_task_broadcast ON tasks;
CREATE TRIGGER trg_task_broadcast
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.on_task_broadcast();

-- ============================================================
-- 5. task_logs 트리거 → room:task:<task_id>:logs Broadcast
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_task_log_broadcast()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 개별 태스크 로그 채널로 전송
  PERFORM public.broadcast_to_channel(
    'room:task:' || NEW.task_id || ':logs',
    'insert',
    jsonb_build_object(
      'type',   'insert',
      'record', to_jsonb(NEW)
    )
  );

  -- 전체 로그 채널에도 전송 (대시보드 모니터링용)
  PERFORM public.broadcast_to_channel(
    'room:task_logs',
    'insert',
    jsonb_build_object(
      'type',   'insert',
      'record', to_jsonb(NEW)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_log_broadcast ON task_logs;
CREATE TRIGGER trg_task_log_broadcast
  AFTER INSERT ON task_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.on_task_log_broadcast();

-- ============================================================
-- 6. Vault 시크릿 설정용 헬퍼 (1회 실행)
--    Supabase SQL Editor에서 직접 실행하세요
-- ============================================================
-- 방법 A: Vault 사용 (권장)
--   SELECT vault.create_secret('https://YOUR_PROJECT.supabase.co', 'supabase_url');
--   SELECT vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'supabase_service_role_key');
--
-- 방법 B: ALTER DATABASE 설정 (Vault 미사용 시)
--   ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
--   ALTER DATABASE postgres SET app.supabase_service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- ============================================================
-- 적용 후 체크리스트:
-- [x] Vault 시크릿 설정 (supabase_url + supabase_service_role_key)
--     또는 ALTER DATABASE 설정
-- [ ] Supabase Dashboard → Realtime → Authorization 확인
-- [ ] Agent .env에 SUPABASE_SERVICE_ROLE_KEY 추가
-- [ ] 테스트: tasks INSERT → room:tasks Broadcast 수신 확인
-- [ ] 테스트: task_logs INSERT → room:task:<id>:logs 수신 확인
-- ============================================================
