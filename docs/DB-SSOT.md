# DB 스키마 SSOT (Single Source of Truth)

스키마 역할 정의와 DB/마이그레이션 강제 규칙.

---

## 테이블 역할 정의

### scripts

- 실행 스크립트 버전의 **단일 소스**. JavaScript/ADB Shell 스크립트 본문·파라미터 스키마·기본값을 저장한다.
- `status`(draft/active/archived), `type`(javascript/adb_shell), `timeout_ms`·`params_schema`·`default_params`로 실행 정책을 정의한다.
- 조회 시 `status`, `name` 인덱스를 사용한다. 변경은 마이그레이션 또는 관리 API만 허용한다.

### workflows

- 워크플로 정의의 **단일 소스**. MAIN/MAINTENANCE/EVENT 종류별로 단계(steps) JSON을 저장한다.
- `(id, version)` 복합 PK로 버전 관리하며, `is_active`로 사용 중인 정의만 노출한다.
- 조회 시 `id`, `is_active` 인덱스를 사용한다. 워크플로 변경은 마이그레이션 또는 배포 파이프라인만 반영한다.

### task_devices

- 태스크–디바이스 할당/실행 엔진의 **단일 소스**. 한 태스크를 어떤 PC·디바이스에서 실행할지, 큐/런닝/완료/실패 상태를 관리한다.
- Claim·완료·실패·재시도는 반드시 RPC(`claim_task_devices_for_pc`, `renew_task_device_lease`, `complete_task_device`, `fail_or_retry_task_device`)로만 수행한다.
- queued partial index, running lease index, task_id/pc_id/device_id 인덱스로 조회·Claim 성능을 보장한다.

---

## 4대 강제 규칙

1. **마이그레이션 전용**  
   모든 스키마·인덱스·RLS·RPC 변경은 `supabase/migrations/*.sql` 파일로만 적용한다. Supabase 대시보드에서 직접 테이블/컬럼을 추가·삭제하지 않는다.

2. **SSOT 준수**  
   scripts / workflows / task_devices 테이블의 역할·컬럼 의미·인덱스 용도는 이 문서(DB-SSOT.md)와 마이그레이션 SQL을 기준으로 한다. 코드·대시보드 설명은 이 정의와 일치시킨다.

3. **보안**  
   `SUPABASE_SERVICE_ROLE_KEY`를 클라이언트 코드에 노출하지 않는다. 비밀·API 키는 환경 변수 또는 Secret Manager만 사용하며, `.env` 실값 커밋 금지.

4. **인덱스·쿼리**  
   인덱스는 실제 접근 패턴(조회·필터·정렬·Claim 조건)에 맞게 설계한다. 부분 인덱스(partial index)는 `WHERE status = 'queued'` 등 조건이 있는 쿼리에 사용한다.
