# 프로덕션 마이그레이션 (최소 세트)

workflows는 **재활용**하며 `CREATE TABLE workflows`는 하지 않음. 기존 `workflows`의 steps/params_schema/timeout_ms 등을 그대로 사용하거나 필요한 컬럼만 ALTER로 보강.

## A. 적용할 파일 (순서)

| 순서 | 파일 | 내용 |
|------|------|------|
| 1 | `01_add_scripts.sql` | **scripts** 테이블 신설 |
| 2 | `02_add_devices_connection_id.sql` | **devices.connection_id** + 인덱스 (serial/serial_number 자동 감지) |
| 3 | `03_add_task_devices_engine.sql` | **task_devices** 테이블 + RPC 4개 |
| 4 | (선택) `04_workflows_definitions_view.sql` | 뷰 `workflows_definitions` ← 기존 `workflows` (앱이 이 이름으로 조회) |
| 5 | (선택) `05_seed_optional.sql` | WATCH_MAIN(1) + scripts 4개 |

- **04**: 기존 `workflows` 테이블에 `id, version, kind, name, is_active, steps` 컬럼이 있어야 함. 없으면 ALTER TABLE로 보강 후 뷰 생성.
- **05**: `workflows`에 INSERT하므로 PK가 `(id, version)`이고 `id`가 text 타입이어야 함. 다르면 수정 후 실행.

## B. 적용 방법 (둘 중 하나)

### 방법 1) Supabase CLI

이미 project-ref가 있으면:

```bash
npx supabase link --project-ref <project-ref>
```

이 폴더의 SQL은 `supabase/migrations/`가 아니므로 **SQL Editor에서 직접 붙여넣기**하는 것을 권장. CLI로 통일하려면 아래 파일들을 `supabase/migrations/`에 타임스탬프 순서로 복사한 뒤:

```bash
npx supabase db push
```

### 방법 2) Supabase SQL Editor에서 직접 적용

1. 대시보드 → SQL Editor
2. `01_add_scripts.sql` 내용 붙여넣기 → Run
3. `02_add_devices_connection_id.sql` → Run
4. `03_add_task_devices_engine.sql` → Run
5. (선택) `04_workflows_definitions_view.sql` → Run
6. (선택) `05_seed_optional.sql` → Run

## C. 적용 확인 SQL (프로덕션에서 실행)

```sql
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
```

위 결과로 `task_devices`, `scripts` 두 테이블과 RPC 4개가 보이면 적용 완료.
