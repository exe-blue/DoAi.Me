# DoAi.Me PC Agent

Node.js agent that bridges Supabase and Xiaowei to run YouTube view tasks on connected devices.

**Run:** `node agent.js`

## Before running

Ensure Node, env config, and Xiaowei are set up so the agent can talk to Supabase and devices.

- **Node.js** 18 or later.
- **Environment:** Copy `.env.example` to `.env` and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PC_NUMBER`, and optionally `XIAOWEI_WS_URL`.
- **Xiaowei** must be running (e.g. `ws://127.0.0.1:22222/`) for device control; the agent connects to it for ADB/WebSocket commands.

## Key modules

- **agent.js** — Main entry; wires Xiaowei, Supabase, heartbeat, and dispatchers.
- **device-orchestrator.js** — Tracks device state and assigns work via `claim_next_assignment` RPC.
- **video-dispatcher.js** — Creates jobs and job_assignments from active videos (60s interval).
- **task-executor.js** — Runs assigned tasks on devices via Xiaowei/ADB.
- **supabase-sync.js** — Supabase client, device sync, and Realtime subscriptions.

## E2E pipeline diagnostics

If the orchestrator stays in warmup and never claims assignments, run the SQL in **Supabase SQL Editor** (project `vyfxrplzhskncigyfkaz`):

- **Queries:** `supabase/migrations/20260225000000_e2e_diagnostic_queries.sql` (Step 1 → Step 2 or 3 → Step 4).
- **Step 1:** Pending assignments exist? If no → VideoDispatcher or primary PC; if yes → Step 3 (claim RPC / pc_id).
- **Step 3:** `claim_next_assignment(pc_uuid, 'test_serial')` returns a row? If yes, RPC is fine (check Orchestrator `pcId`); if no, fix pc_id or run migration `20260225110000` for nullable `device_id`.
- **Debug logs:** Set `DEBUG_ORCHESTRATOR=1` or `DEBUG_ORCHESTRATOR_CLAIM=1` to log each claim attempt and result. Claim success always logs `[DeviceOrchestrator] <serial> → assignment <id>`.
