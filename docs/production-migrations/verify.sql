-- 프로덕션 마이그레이션 적용 후 확인용. 순서대로 실행해 보시면 됩니다.

-- 1) task_devices, scripts 테이블 존재 확인
select * from information_schema.tables
where table_schema='public' and table_name in ('task_devices','scripts');

-- 2) task_devices 컬럼 확인
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='task_devices'
order by ordinal_position;

-- 3) RPC 존재 확인
select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in (
    'claim_task_devices_for_pc',
    'renew_task_device_lease',
    'complete_task_device',
    'fail_or_retry_task_device'
  );
