-- DoAi.Me v2.1 - Fix Broadcast Topic Prefix
-- HTTP Broadcast API expects raw channel name, NOT 'realtime:' prefix
-- Before: 'realtime:room:tasks' → API accepts 202 but never delivers
-- After:  'room:tasks' → API delivers correctly

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
  -- NOTE: HTTP API expects raw channel name (no 'realtime:' prefix)
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
          'topic',   p_channel,
          'event',   p_event,
          'payload', p_payload
        )
      )
    )
  );
END;
$$;
