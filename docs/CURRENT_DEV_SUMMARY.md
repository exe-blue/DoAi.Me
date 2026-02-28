# Current development summary

Single reference for task queue ↔ videos flow, device orchestration, agent layers, and schema. **Read in under 2 minutes.**

---

## Architecture (current)

- **Task queue → tasks → task_devices**: `task_queue` (status=queued) → Agent **QueueDispatcher** creates **tasks** row → DB trigger creates **task_devices** (one per device, up to `device_count`). Queue row → status=dispatched.
- **Execution**: Agent **DeviceOrchestrator** (3s poll) claims **task_devices** via RPC (`claim_next_task_device` / `claim_task_devices_for_pc`) → **TaskExecutor.runTaskDevice()** → Xiaowei → device.
- **Videos**: Source of watch config. `videos` table feeds task config (title, duration_sec, watch_%, probs). Task creation uses `video_id`; trigger joins `videos` for `task_devices.config`.
- **jobs / job_assignments**: Legacy. Current run path is **task_queue → tasks → task_devices** only. No VideoDispatcher; no jobs polling.

---

## Agent three layers

| Layer | Purpose | Key modules |
|-------|--------|-------------|
| **1. Device management** | PC/device registration, heartbeat | `device/heartbeat.js`, `core/supabase-sync.js`, `device/device-watchdog.js` |
| **2. Event / task management** | Receive queue events, create tasks + task_devices, claim | `scheduling/queue-dispatcher.js`, `scheduling/schedule-evaluator.js`, `device/device-orchestrator.js` (claim) |
| **3. Device command** | Run watch/comment/like on device | `device/device-orchestrator.js` (run), `task/task-executor.js` |

Details: `docs/qa-reports/agent-three-layers-verification.md`, `docs/qa-reports/agent-flow-verification-bidirectional.md`.

---

## Key files and roles

| Area | File / path | Role |
|------|-------------|------|
| Queue → task | `agent/scheduling/queue-dispatcher.js` | Realtime task_queue INSERT + 10s poll; dequeue → insert `tasks` → trigger creates `task_devices` |
| Schedules | `agent/scheduling/schedule-evaluator.js` | Evaluates task_schedules → inserts into `task_queue` |
| Orchestration | `agent/device/device-orchestrator.js` | 3s loop: device list, claim RPC, run TaskExecutor, complete/fail RPC |
| Execution | `agent/task/task-executor.js` | runTaskDevice → _watchVideoOnDevice (search, play, skip ad, watch %, like/comment/save) |
| Sync / DB | `agent/core/supabase-sync.js` | PC registration, device upsert, mark offline, execution logs, RPC wrappers |
| Pipeline (web) | `lib/pipeline.ts`, `lib/sync-channels-runner.ts` | createManualTask, createBatchTask; cron sync channels → videos → task_queue enqueue |
| Source column | `supabase/migrations/20260226120000_task_queue_tasks_videos_source.sql` | task_queue/tasks/videos.source = 'manual' \| 'channel_auto'; dequeue order: manual first, then priority DESC, created_at ASC |

---

## Schema and where to look

- **Migrations**: `supabase/migrations/` — task_queue, tasks, task_devices, triggers (e.g. `20260213_step12_task_queue_schedules.sql`, `20260226120000_task_queue_tasks_videos_source.sql`, `20260229000000_task_devices_on_task_insert_trigger.sql`), claim RPCs, timeouts.
- **Rules**: `.cursor/rules/project-core.mdc` (DB column names for channels, videos, jobs, job_assignments, devices, pcs). `.cursor/rules/supabase-schema.mdc` if present.
- **Types**: `lib/supabase/database.types.ts` (generated/edited for tasks, task_queue, task_devices, execution_logs).
- **Flow details**: `docs/QUEUE_AND_TASKS_FLOW.md` (how many devices, refill, queue vs tasks). `docs/architecture-five-layer-pipeline.md` (5-layer + pipeline events).

---

## Source of truth (summary)

| Topic | Source of truth |
|-------|-----------------|
| Task queue ↔ videos flow | This doc + `QUEUE_AND_TASKS_FLOW.md` + `lib/pipeline.ts` |
| Device orchestration | `agent/device/device-orchestrator.js` + `docs/qa-reports/agent-flow-verification-bidirectional.md` |
| Agent three layers | `docs/qa-reports/agent-three-layers-verification.md` |
| DB schema (tasks, task_queue, task_devices, videos) | `supabase/migrations/` + `.cursor/rules/project-core.mdc` |
