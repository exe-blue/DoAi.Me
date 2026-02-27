# DoAi.Me Agent — Module Layer Reference

Bootstrap orchestrator: `agent.js`
Configuration: `config.js`

Initialization order: Core → Task → Heartbeat → Setup → Subscriptions → Scheduling → DeviceOrchestrator

---

## Layer 1 — Core / External Communication

| Module | Role |
|--------|------|
| `core/xiaowei-client.js` | Xiaowei WebSocket client (`ws://127.0.0.1:22222/`). Auto-reconnect, command dispatch to Galaxy S9 phones. Emits `connected` / `disconnected` / `error`. |
| `core/supabase-sync.js` | Supabase DB queries + Realtime subscriptions + batched log pipeline. Manages `pcId`, task polling, broadcast/postgres_changes subscriptions, and log buffer (50-item batches, 3s flush). Uses service-role key to bypass RLS. |
| `core/dashboard-broadcaster.js` | Publishes real-time device/task status updates to the dashboard via Supabase Broadcast channel. |
| `core/index.js` | Barrel export for the core layer. |

**DB tables accessed:** `pcs`, `workers`, `devices`, `tasks`, `task_logs`, `settings`

---

## Layer 2 — Device Control

| Module | Role |
|--------|------|
| `device/heartbeat.js` | 30s interval: syncs device list from Xiaowei → `devices` table, updates worker `last_heartbeat`, reports task stats + subscription status in `metadata`. |
| `device/adb-reconnect.js` | Detects offline devices and issues ADB TCP reconnect commands via Xiaowei. Tracks per-device failure counts. |
| `device/device-watchdog.js` | Monitors for error-rate spikes and mass device dropout events. Triggers alerts via `broadcaster`. |
| `device/device-orchestrator.js` | Device state machine driven by `claim_next_assignment` RPC. Manages the claim → execute → release lifecycle for `job_assignments`. Primary path for scheduled YouTube jobs. |
| `device/device-presets.js` | Xiaowei preset actions for device initialization: `scan`, `optimize`, `ytTest`, `warmup`. |
| `device/index.js` | Barrel export for the device layer. |

**DB tables accessed:** `devices`, `job_assignments` (via RPC), `workers`

---

## Layer 3 — Task Execution

| Module | Role |
|--------|------|
| `task/task-executor.js` | Dispatches tasks by `task_type` (`preset` / `adb` / `direct` / `batch` / `youtube`) to the appropriate Xiaowei action. Updates task status (`assigned → running → done/failed`). Writes execution logs via `supabase-sync`. |
| `task/stale-task-cleaner.js` | On cold-start and periodically: recovers tasks stuck in `running` status from a previous crash. Resets them to `pending` or `failed`. |
| `task/command-executor.js` | Low-level command execution wrapper used by `task-executor`. Handles individual Xiaowei command dispatch and result parsing. |
| `task/command-poller.js` | Polls for command results from Xiaowei with configurable timeout. Used when Xiaowei commands are asynchronous. |
| `task/task-state-machine.js` | State machine helpers for task lifecycle transitions. Enforces valid status progressions. |
| `task/index.js` | Barrel export for the task layer. |

**DB tables accessed:** `tasks`, `task_logs`

---

## Layer 4 — Scheduling

| Module | Role |
|--------|------|
| `scheduling/queue-dispatcher.js` | Converts `task_queue` entries into real `tasks`. Respects device availability and concurrency limits. |
| `scheduling/schedule-evaluator.js` | Evaluates cron-style `task_schedules` entries. On match, inserts into `task_queue`. Runs on a 60s tick. |
| `scheduling/video-dispatcher.js` | **Primary PC only** (`IS_PRIMARY_PC=true`). Creates `jobs` and `job_assignments` for active `videos`. Drives the bulk YouTube watch pipeline. |
| `scheduling/index.js` | Barrel export for the scheduling layer. |

**DB tables accessed:** `task_queue`, `task_schedules`, `tasks`, `videos`, `jobs`, `job_assignments`

---

## Layer 5 — Setup & Initialization

| Module | Role |
|--------|------|
| `setup/proxy-manager.js` | Loads proxy–device assignments from `proxies` table. Applies SOCKS5/HTTP proxy config to devices via Xiaowei. Runs periodic check loop for rotation policy. |
| `setup/account-manager.js` | Loads account–device assignments from `accounts` table. Verifies YouTube login state on each device at startup. |
| `setup/script-verifier.js` | Checks `SCRIPTS_DIR` for required AutoJS scripts (e.g. `youtube_watch.js`). Runs a test execution to confirm deployment is functional. |
| `setup/comment-generator.js` | Generates comment text for YouTube comment tasks. Used by `task-executor` for `youtube` type tasks with comment actions. |
| `setup/index.js` | Barrel export for the setup layer. |

**DB tables accessed:** `proxies`, `accounts`, `workers` (metadata)

---

## Layer 6 — Config & Bootstrap

| Module | Role |
|--------|------|
| `config.js` | Merges `.env` static config with dynamic settings from the `settings` DB table. Emits `config-updated` events on Realtime changes (allows live interval/concurrency updates without restart). |
| `agent.js` | Bootstrap orchestrator. Initializes all layers in dependency order. Wires up Realtime subscriptions, config-updated listeners, and graceful shutdown handlers. |

**DB tables accessed:** `settings`

---

## DB Schema Access Map

| Table | Modules |
|-------|---------|
| `pcs` / `workers` | `supabase-sync`, `heartbeat` |
| `devices` | `heartbeat`, `adb-reconnect`, `device-orchestrator`, `proxy-manager` |
| `tasks` | `task-executor`, `stale-task-cleaner`, `queue-dispatcher`, `supabase-sync` |
| `task_logs` | `task-executor` (via `supabase-sync` batch pipeline) |
| `job_assignments` | `device-orchestrator` (via `claim_next_assignment` RPC), `video-dispatcher` |
| `jobs` | `video-dispatcher` |
| `videos` | `video-dispatcher` |
| `task_queue` | `queue-dispatcher`, `schedule-evaluator` |
| `task_schedules` | `schedule-evaluator` |
| `proxies` | `proxy-manager` |
| `accounts` | `account-manager` |
| `settings` | `config.js` |

---

## Realtime Channels

| Channel | Producer | Consumer |
|---------|----------|----------|
| `room:tasks` (Broadcast) | DB trigger → `dashboard-broadcaster` | `supabase-sync.subscribeToBroadcast()` |
| `room:tasks` (postgres_changes) | Supabase CDC | `supabase-sync.subscribeToTasks()` (fallback) |
| `room:task:<id>:logs` | `dashboard-broadcaster` | Dashboard UI |
| `room:dashboard` | `dashboard-broadcaster` | Dashboard UI |
| `settings` channel | Supabase CDC | `config.subscribeToChanges()` |
