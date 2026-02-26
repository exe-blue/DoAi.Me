# Release 1 — DB 마이그레이션 (프로덕션/스테이징)

프로덕션 DB에 `task_devices`·`scripts`·RPC 4개가 없을 때 **한 번** 적용하는 단계입니다.

## 완료 조건

- `information_schema.tables`에서 `task_devices`, `scripts` 조회됨
- `information_schema.routines`에 `claim_task_devices_for_pc`, `renew_task_device_lease`, `complete_task_device`, `fail_or_retry_task_device` 존재
- `devices.connection_id` 컬럼 존재

## 방법 A: Supabase Dashboard (권장)

1. [Supabase Dashboard](https://supabase.com/dashboard) → 프로젝트 선택 → **SQL Editor**
2. `supabase/migrations/20260227000000_release1_task_devices_scripts.sql` 파일 내용 전체 복사 후 붙여넣기
3. **Run** 실행

## 방법 B: psql (연결 문자열 있을 때)

```bash
# 프로덕션 DB 연결 문자열 설정 후
export SUPABASE_DB_URL='postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres'

psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260227000000_release1_task_devices_scripts.sql
```

## 방법 C: run_migrations.sh (전체 순서로 적용)

이미 다른 마이그레이션을 같은 방식으로 적용 중이면:

```bash
export SUPABASE_DB_URL='postgresql://...'
./supabase/run_migrations.sh
```

`ORDER` 배열에 `20260227000000_release1_task_devices_scripts.sql`가 포함되어 있음.

## 포함 내용

| 항목 | 설명 |
|------|------|
| `devices.connection_id` | 실행 타겟 (connection_id ?? serial) |
| `scripts` 테이블 | name 유니크, prefix allowlist (yt/, device/, ops/) |
| `workflows_definitions` 테이블 | 워크플로 버전별 정의 |
| `task_devices` 테이블 | task_id, device_id, pc_id, status, lease, config 등 |
| RPC 4개 | claim_task_devices_for_pc, renew_task_device_lease, complete_task_device, fail_or_retry_task_device |
| Seed | WATCH_MAIN(1) + scripts 4개 (yt/preflight, yt/search_title, yt/watch, yt/actions) |

## 적용 후

- **스테이징**: 먼저 스테이징 DB에 적용 후 E2E 1회 통과 확인
- **프로덕션**: 동일 SQL을 프로덕션 DB에 적용 후 Vercel 배포·에이전트 롤아웃
