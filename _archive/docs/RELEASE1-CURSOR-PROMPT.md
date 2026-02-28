# Release 1 Cursor 프롬프트 (Phase 0 + 1 + 2, workflows 재활용 버전)

아래 **한 블록**을 Cursor에 붙여 넣어 Phase 0(DB) → Phase 1(Agent) → Phase 2(Dashboard) 작업을 유도할 수 있다.

---

## 복사용 단일 프롬프트 (Cursor에 붙여넣기)

```
Release 1 Phase 0: DB 마이그레이션만 먼저 해줘. workflows는 재활용한다.

1) scripts 테이블 추가 마이그레이션 생성 (supabase/migrations/)
2) task_devices + RPC 4개 마이그레이션 생성
3) devices.connection_id 마이그레이션 생성
4) workflows: CREATE TABLE workflows 하지 말고, 기존 workflows 사용. steps는 workflows.steps jsonb. 없으면 ALTER TABLE workflows ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'::jsonb; 로 보강. 앱은 workflows_definitions로 읽으므로 CREATE VIEW workflows_definitions AS SELECT ... FROM workflows 로 뷰만 생성
5) seed 마이그레이션: scripts 4개(active) insert, workflows에 id='WATCH_MAIN' row upsert하고 steps 채움 (WorkflowStep[] 형식: step.ops[].scriptRef.scriptId 또는 id + version)
```

---

## Phase 0: DB 마이그레이션 (workflows는 ALTER/seed만)

**목표:** scripts, task_devices+RPC, devices.connection_id 마이그레이션 추가. **workflows는 재활용**하며 `CREATE TABLE workflows`는 하지 않는다. 기존 `workflows` 테이블이 있으면 그대로 두고 필요한 컬럼만 ALTER로 보강하고, 앱이 읽을 수 있도록 `workflows_definitions` 뷰만 만들거나 기존 테이블을 뷰로 노출한다.

### 할 일

1. **scripts 테이블 추가 마이그레이션 생성**
   - `supabase/migrations/` 아래 새 파일 (예: `YYYYMMDD_HHMMSS_add_scripts.sql`).
   - `public.scripts` 테이블: `id` (uuid), `name`, `version`, `status` (draft|active|archived), `type` (javascript|adb_shell), `content`, `timeout_ms`, `params_schema`, `default_params`, `created_at`, `updated_at`.
   - PK: `(id, version)`. 인덱스: `name`, `status`.

2. **task_devices + RPC 마이그레이션 생성**
   - `public.task_devices` 테이블: `id`, `task_id`, `pc_id`, `device_id`, `status` (queued|running|completed|failed|canceled), `priority`, `retry_count`, `max_retries`, `claimed_by_pc_id`, `lease_expires_at`, `started_at`, `completed_at`, `config` (jsonb), `result`, `error`, `last_error_at`, `created_at`, `updated_at`. UNIQUE `(task_id, device_id)`.
   - RPC 4개: `claim_task_devices_for_pc(pc_id, max_to_claim, lease_minutes)`, `renew_task_device_lease(task_device_id, pc_id, lease_minutes)`, `complete_task_device(task_device_id, pc_id, result_json)`, `fail_or_retry_task_device(task_device_id, pc_id, error_text, retryable)`.
   - 인덱스: task_id, pc_id, device_id, queued/running 조건부 인덱스.

3. **devices.connection_id 마이그레이션 생성**
   - `ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS connection_id text;`
   - 인덱스: `connection_id`, `pc_id`. 시리얼 컬럼이 `serial`이면 `serial`, `serial_number`이면 `serial_number`에 인덱스 (스키마에 맞게 또는 information_schema로 분기).

4. **workflows 재활용 (CREATE TABLE workflows 하지 않음)**
   - **steps**는 기존 `workflows.steps` jsonb를 사용한다.
   - `workflows` 테이블이 이미 있으면: `steps` 컬럼이 없을 때만  
     `ALTER TABLE public.workflows ADD COLUMN steps jsonb NOT NULL DEFAULT '[]'::jsonb;` 로 보강.
   - `workflows` 테이블이 없으면: 이번 Phase에서 **테이블을 새로 만들지 말고**, seed 마이그레이션에서 INSERT할 대상이 되는 최소 스키마만 문서로 명시하거나, 필요 시 단일 마이그레이션에서만 `CREATE TABLE workflows (id text, version int, ... steps jsonb, ...)` 한 번 허용하고 이후에는 ALTER/seed만 한다.
   - 앱은 `workflows_definitions` 이름으로 조회하므로:  
     `CREATE OR REPLACE VIEW public.workflows_definitions AS SELECT id::text, version, kind, name, coalesce(is_active, true) AS is_active, coalesce(steps, '[]'::jsonb) AS steps, ... FROM public.workflows;` 로 뷰를 만들어 두면 된다. (기존 `workflows` 컬럼명이 다르면 SELECT 목록만 맞춘다.)

5. **seed 마이그레이션**
   - **scripts 4개** insert: status=`'active'`, type=`'javascript'`, content는 placeholder (예: `export default async function(ctx, params){ if (ctx?.log) ctx.log('...'); }`), timeout_ms·params_schema·default_params 적절히. `ON CONFLICT (id, version) DO NOTHING`.
   - **workflows** 한 건: `id='WATCH_MAIN'` (이미 PK가 text면 그대로, uuid면 타입에 맞게).  
     해당 row를 **upsert**하고 **steps** jsonb를 채운다.  
     steps 형식은 앱의 `WorkflowStep[]` (배열 요소가 `{ ops: [ { type: 'javascript', scriptRef: { scriptId 또는 id, version }, params } ] }`)에 맞춘다.
   - `workflows`에 PK가 (id, version)이고 id가 text라면 `INSERT ... ON CONFLICT (id, version) DO UPDATE SET steps = EXCLUDED.steps, ...` 형태로 upsert.

**중요:**  
- `CREATE TABLE workflows_definitions` 는 하지 않는다.  
- `workflows` 는 “기존 테이블 재활용”이므로 새로 만드는 경우는 최소화하고, 있으면 ALTER/뷰/seed만 한다.

---

## Phase 1: Agent (task_devices 단일 실행 경로)

- 실행 단위는 **task_devices** 만: claim → lease 갱신 → complete / fail_or_retry.
- 스크립트는 DB `scripts` 에서 on-demand 동기화 후 Node에서 실행.
- legacy 제거: tasks 직접 실행, job_assignments 루프, task_queue 실행 단위 제거.
- 유지: heartbeat, device 등록, OTG 스캔.

---

## Phase 2: Dashboard / Pipeline (publish = snapshot → task_devices)

- 모든 publish 경로는 **workflows_definitions(뷰) → snapshot → task_devices** 로만 (buildConfigFromWorkflow).
- 버전 고정, 실행 스냅샷, timeout, scripts status=active 강제.
- task_devices 외 실행 경로 제거 (이중 실행 방지).

---

## 적용 순서 (프로덕션)

1. scripts 마이그레이션  
2. devices.connection_id 마이그레이션  
3. task_devices + RPC 마이그레이션  
4. workflows ALTER(필요 시) + workflows_definitions 뷰  
5. seed (scripts 4개 + workflows WATCH_MAIN upsert)

적용 후 `docs/production-migrations/verify.sql` 로 테이블·RPC 존재 여부 확인.
