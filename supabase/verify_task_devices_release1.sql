-- 적용 후 검증: Supabase SQL Editor에서 실행 (한 번에 2행 출력)
-- 성공: task_devices 테이블 OK, claim/lease RPC OK

select 항목, 개수, 상태 from (
  select 1 as ord,
    'task_devices 테이블' as 항목,
    count(*)::text as 개수,
    case when count(*) = 1 then 'OK' else '없음' end as 상태
  from information_schema.tables
  where table_schema = 'public' and table_name = 'task_devices'
  union all
  select 2 as ord,
    'claim/lease RPC' as 항목,
    count(*)::text || ' / 4' as 개수,
    case when count(*) = 4 then 'OK' else '부족' end as 상태
  from information_schema.routines
  where routine_schema = 'public'
    and routine_name in (
      'claim_task_devices_for_pc',
      'renew_task_device_lease',
      'complete_task_device',
      'fail_or_retry_task_device'
    )
) t
order by ord;

-- (선택) RPC 이름 각각 확인
-- select routine_name
-- from information_schema.routines
-- where routine_schema = 'public'
--   and routine_name in (
--     'claim_task_devices_for_pc',
--     'renew_task_device_lease',
--     'complete_task_device',
--     'fail_or_retry_task_device'
--   )
-- order by routine_name;
