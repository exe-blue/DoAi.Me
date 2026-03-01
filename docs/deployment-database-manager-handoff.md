# Deployment / DB 수정 사항 — deployment-database-manager 실행용

에이전트 env·기기 수집·task_devices SSOT 수정과 연동해, **서버/DB 측에서 수정·검증할 사항**을 정리합니다.  
`deployment-database-manager` 서브에이전트가 이 문서를 기준으로 실행할 수 있습니다.

---

## 1. 전제

- **에이전트**는 `devices` 테이블에 **serial_number**, **pc_id**, **last_heartbeat** 컬럼을 사용합니다.
- 실행 단위는 **task_devices** (claim → runTaskDevice). job_assignments는 레거시입니다.

---

## 2. DB 스키마 확인 (필수)

실제 Supabase 프로젝트에서 아래를 확인하세요.

### 2.1 devices 테이블

- **컬럼명**
  - 기기 식별: `serial` vs `serial_number` → 에이전트는 **serial_number** 기준으로 이미 코드 수정됨. DB가 `serial`만 있으면 마이그레이션으로 `serial_number` 추가 또는 에이전트 롤백 필요.
  - PC 소속: `pc_id` (UUID, pcs.id FK) vs `worker_id` (workers.id FK) → 에이전트는 **pc_id** 사용.
  - 마지막 시각: `last_heartbeat` vs `last_seen` / `last_seen_at` → 에이전트는 **last_heartbeat** 사용.
- **Unique 제약**: `serial_number` 또는 `serial` 중 어떤 컬럼에 unique가 걸려 있는지 확인. 에이전트 upsert는 `onConflict: 'serial_number'` 사용.

**확인 쿼리 예시**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'devices'
ORDER BY ordinal_position;
```

### 2.2 task_devices / tasks

- **task_devices** 테이블 존재 여부, 컬럼: `id`, `task_id`, `device_serial`, `status`, `pc_id`, `completed_at`, `duration_ms`, `result` (JSONB) 등.
- **RPC** 존재 여부: `claim_task_devices_for_pc`, `claim_next_task_device`, `complete_task_device`, `fail_or_retry_task_device`.

---

## 3. 마이그레이션 적용 (필요 시)

- **스키마 확인**: Supabase Dashboard SQL Editor에서 **docs/verify_schema_handoff.sql** 실행 → devices 컬럼/unique, task_devices, pcs, RPC 4개 확인.
- **devices 정렬 마이그레이션**: `supabase/migrations/20260229100000_align_devices_handoff.sql` 이 다음을 수행한다.  
  - `serial_number` 컬럼 추가 및 `serial` 값 백필, `serial_number`에 대한 unique index 추가 (에이전트 upsert `onConflict: 'serial_number'` 사용 가능).  
  - `last_heartbeat` 컬럼 추가 및 `last_seen` 값 백필.  
  적용: `npm run db:push` 또는 Supabase MCP `apply_migration`.
- **devices**에 `serial_number`가 없고 `serial`만 있는 경우: 위 정렬 마이그레이션으로 해결. 또는 에이전트를 `serial` 기준으로 되돌리기 (코드 변경).
- **devices**에 `last_heartbeat`가 없으면: 위 정렬 마이그레이션에 포함됨.
- **pcs** 테이블 존재 여부. 없으면 `workers`만 있는 레거시 스키마일 수 있음 → 에이전트는 **pcs** 기준이므로 pcs 테이블 및 pc_id FK 필요 (20260223110000_create_pcs_table.sql 참고).

프로젝트 루트의 `supabase/migrations/` 에 이미 있는 마이그레이션 중 devices/task_devices 관련 파일을 순서대로 적용했는지 확인.

---

## 4. 배포 시 주의

- **에이전트**는 `agent/.env`를 **override: true**로 로드하므로, 같은 폴더의 `.env` 값이 셸/상위 env보다 우선합니다.
- **대시보드/API**는 이제 **task_devices** 기준으로 미션 리포트·오늘 통계를 조회합니다. `job_assignments` 테이블이 없어도 동작하며, task_devices에 completed_at·result가 있어야 집계됩니다.

---

## 5. deployment-database-manager 실행 시 지시 예시

다음과 같이 서브에이전트에 넘기면 됩니다.

- “`docs/deployment-database-manager-handoff.md`를 읽고, 현재 Supabase 스키마가 문서의 전제(devices.serial_number, pc_id, last_heartbeat; task_devices 테이블 및 RPC)와 맞는지 확인해 주세요. 불일치하면 필요한 마이그레이션을 제안하거나 적용해 주세요.”

---

## 6. Schema verification report (2026-02-28)

**1. `npx supabase db diff`**  
Not runnable in this environment (Docker required for shadow DB). Drift cannot be assessed locally; run in a linked environment with Docker or verify against the remote project via Dashboard SQL / MCP.

**2. What exists in migrations (source of truth for “intended” schema)**

| Item | Migration | Status |
| ------ | ------------ | -------- |
| **devices.serial_number** | `20260229100000_align_devices_handoff.sql` | Added + unique index `uq_devices_serial_number` (partial, WHERE serial_number IS NOT NULL). |
| **devices.connection_id** | `20260226210000_devices_connection_id.sql` | Added. |
| **devices.pc_id** | `20260223110000_create_pcs_table.sql` | Added, FK → pcs(id). |
| **devices.worker_id** | `00001_initial_schema.sql` | Exists (FK → workers). So DB has **both** pc_id and worker_id. |
| **devices.last_heartbeat** | `20260229100000_align_devices_handoff.sql` | Added, backfilled from last_seen. |
| **execution_logs** | `20260228110000_execution_logs.sql` | Table with id, execution_id, device_id (TEXT), status, data, details, level, message, created_at. |
| **mark_device_offline** | `20260301000002_mark_device_offline.sql` | RPC(p_device_serial TEXT). |
| **claim_task_devices_for_pc** | `20260228100000_fix_rpc_param_names.sql` | RPC(runner_pc_name TEXT, max_to_claim INT, lease_minutes INT). Uses task_devices.pc_id. |
| **claim_next_task_device** | `20260227000000_claim_next_task_device.sql` | RPC(p_worker_id UUID, p_device_serial TEXT). |
| **complete_task_device** | `20260228100000_fix_rpc_param_names.sql` | RPC(p_task_device_id UUID, p_result JSONB optional). |
| **fail_or_retry_task_device** | `20260228100000_fix_rpc_param_names.sql` | RPC(p_task_device_id UUID, p_error TEXT). |

**3. App vs agent (worker_id vs pc_id)**  
- **Migrations:** `devices` has both **worker_id** (00001) and **pc_id** (20260223110000).  
- **Agent** (`agent/core/supabase-sync.js`): upserts only **pc_id** (and serial_number, connection_id, last_heartbeat, etc.); does **not** set worker_id.  
- **App** (`app/api/devices/route.ts`): POST accepts optional **worker_id**; GET filters by **worker_id** only (`eq("worker_id", pc_id)` even when query param is `pc_id`).  
- **Inconsistency:** Devices registered by the agent have **pc_id** set and **worker_id** often null. GET /api/devices?pc_id=&lt;uuid&gt; filters by worker_id, so those devices do not show when filtering by PC.

**Concrete fix (app alignment):**  
- In **GET /api/devices**, when filtering by PC, filter by **pc_id** (or by both pc_id and worker_id with OR) so agent-registered devices appear. Example: if `pc_id` query param is present, use `query = query.eq("pc_id", pc_id)` or `.or(\`pc_id.eq.${pc_id},worker_id.eq.${pc_id}\`)`.

**4. TypeScript types**  
- `lib/supabase/database.types.ts` for **devices** currently exposes **worker_id** and **last_seen**; it does **not** list serial_number, connection_id, pc_id, or last_heartbeat in the devices Row (types may be from an older schema).  
- **Fix:** Regenerate types from the linked Supabase project (`npx supabase gen types typescript --linked > lib/supabase/database.types.ts`) or ensure devices Row/Insert/Update include serial_number, connection_id, pc_id, last_heartbeat.  
- Comment in `lib/supabase/types.ts` already states: “Production devices table uses serial_number, pc_id, last_heartbeat; regenerate from linked project if types differ.”

**5. Summary**

- **OK in migrations:** devices (serial_number, connection_id, pc_id, worker_id, last_heartbeat), execution_logs table, RPCs mark_device_offline, claim_task_devices_for_pc, claim_next_task_device, complete_task_device, fail_or_retry_task_device.  
- **Missing / inconsistent (concrete fixes):**  
  1. **App GET /api/devices:** Filter by **pc_id** (or pc_id OR worker_id) when filtering by PC so agent-registered devices are returned.  
  2. **Types:** Regenerate **lib/supabase/database.types.ts** from linked project so **devices** includes serial_number, connection_id, pc_id, last_heartbeat.  
  3. **Live DB:** Run **docs/verify_schema_handoff.sql** or **supabase/schema_check_handoff.sql** against the real project to confirm the above columns and RPCs exist; if any migration was skipped, apply the listed migrations in MIGRATION_ORDER.md.
