# E2E pipeline diagnostic

How to run E2E diagnostic SQL and interpret the VideoDispatcher → DeviceOrchestrator → TaskExecutor flow.

## 1. Where to run diagnostic SQL

Run the E2E diagnostic queries in **Supabase Dashboard → SQL Editor**. Use the file:

- **`supabase/migrations/20260225000000_e2e_diagnostic_queries.sql`**

Execute steps in order (Step 1 → interpret → Step 2 or 3 → Step 4 as needed). The file includes comments for each block.

## 2. Pipeline flow (one sentence)

**VideoDispatcher** creates jobs and inserts **pending** rows into **job_assignments**; **DeviceOrchestrator** polls and claims one assignment per device via the `claim_next_assignment` RPC, then runs it through **TaskExecutor**.

## 3. device_id nullable migration

After this migration, `job_assignments.device_id` can be NULL (assignments are claimed by device at runtime):

- **`supabase/migrations/20260225110000_job_assignments_device_id_nullable.sql`**

Apply with `npx supabase db push` (or run the migration in the SQL Editor if needed).

## Related

- [VIDEO_DISPATCHER_INSTRUCTIONS.md](../VIDEO_DISPATCHER_INSTRUCTIONS.md)
- [CURSOR_MIGRATION_INSTRUCTIONS.md](../CURSOR_MIGRATION_INSTRUCTIONS.md)
