# DoAi.Me PC Agent

Node.js agent that bridges Supabase and Xiaowei to run YouTube view tasks on connected devices.

**Run:** `node agent.js`

**Execution path (enforced):** SSOT is `task_devices`. Only `claim_task_devices_for_pc` / `claim_next_task_device` → `runTaskDevice`. No `job_assignments` path for new execution.

**Sleep / build:** Single sleep utility: `lib/sleep.js`. Entrypoint: `agent.js` (Node only; no TypeScript build).

## Before running

Ensure Node, env config, and Xiaowei are set up so the agent can talk to Supabase and devices.

- **Node.js** 18 or later.
- **Environment:** Copy `.env.example` to `.env` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PC_NUMBER`, and optionally `XIAOWEI_WS_URL`.
- **Xiaowei** must be running (e.g. `ws://127.0.0.1:22222/`) for device control; the agent connects to it for ADB/WebSocket commands.

## Key modules

- **agent.js** — Main entry; wires Xiaowei, Supabase, heartbeat, and dispatchers.
- **device-orchestrator.js** — Tracks device state and assigns work via `claim_task_devices_for_pc` / `claim_next_task_device` RPC (task_devices SSOT).
- **video-dispatcher.js** — Legacy: previously created jobs/job_assignments; pipeline now uses **task_devices**. Create tasks + task_devices via web dashboard or queue-dispatcher.
- **task-executor.js** — Runs claimed **task_device** rows on devices via Xiaowei/ADB (`runTaskDevice`).
- **supabase-sync.js** — Supabase client, device sync, and Realtime subscriptions.

## E2E pipeline diagnostics

If the orchestrator never claims work, run diagnostics in **Supabase SQL Editor**:

- **Step 1:** Pending task_devices? `SELECT * FROM task_devices WHERE status = 'pending' AND (pc_id = '<your_pc_uuid>' OR pc_id IS NULL) LIMIT 5;`
- **Step 2:** Claim RPC: `SELECT * FROM claim_task_devices_for_pc(runner_pc_id := '<pc_uuid>'::uuid, max_to_claim := 1);` or `claim_next_task_device(p_worker_id := '<pc_uuid>'::uuid, p_device_serial := 'test_serial');` If no row → check pc_id, devices.serial_number, and migrations.
- **Debug logs:** Set `DEBUG_ORCHESTRATOR=1` or `DEBUG_ORCHESTRATOR_CLAIM=1`.
