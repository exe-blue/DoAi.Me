# Agent stack verification report (pre–Electron packaging)

**Baseline:** `docs/agent-device-layer-js-mapping.md`  
**Entry point:** `agent/agent.js`  
**Date:** 2026-02-28

---

## 1. Executables & require chain — OK

All JS files listed in the device-layer doc exist under `agent/` and are reachable from `agent.js`:

| Doc / MODULES | File | Reachable from agent.js |
| --------------- | ------ | --------------------------- |
| device/heartbeat.js | ✓ | Direct require |
| device/device-serial-resolver.js | ✓ | Via heartbeat.js |
| device/device-orchestrator.js | ✓ | Direct require |
| device/screenshot-on-complete.js | ✓ | Via device-orchestrator.js |
| device/device-presets.js | ✓ | Direct require |
| device/adb-reconnect.js | ✓ | Direct require |
| device/device-watchdog.js | ✓ | Direct require |
| core/supabase-sync.js | ✓ | Direct require |
| core/xiaowei-client.js | ✓ | Direct require |
| core/dashboard-broadcaster.js | ✓ | Direct require |
| task/task-executor.js | ✓ | Direct require |
| task/stale-task-cleaner.js | ✓ | Direct require |
| scheduling/queue-dispatcher.js | ✓ | Direct require |
| scheduling/schedule-evaluator.js | ✓ | Direct require |
| setup/proxy-manager.js | ✓ | Direct require |
| setup/account-manager.js | ✓ | Direct require |
| setup/script-verifier.js | ✓ | Direct require |
| config.js | ✓ | Direct require |

No broken `require()` paths. Transitive: `setup/comment-generator.js` (via task-executor).

---

## 2. Data & schema — OK (migrations); app/type fixes needed

**Source:** deployment-database-manager handoff (see `docs/deployment-database-manager-handoff.md` §6).

- **devices:** `serial_number`, `connection_id`, `pc_id`, `last_heartbeat` (and optional `worker_id`) exist in migrations. Agent uses `pc_id`; API POST uses `worker_id` for optional filter.
- **Tables:** task_devices, tasks, task_queue, task_schedules, execution_logs, settings, pcs — all present in migrations.
- **RPCs:** `mark_device_offline`, `claim_task_devices_for_pc`, `claim_next_task_device`, `complete_task_device`, `fail_or_retry_task_device` — all present. `getPcId` is JS (pcs table), not RPC. Queue-dispatcher does not use `dequeue_task_queue_item` RPC (uses SELECT + update); RPC exists for optional use.

**Fixes to do:**

1. **GET /api/devices** — When filtering by PC, use `pc_id` (or `pc_id` OR `worker_id`) so agent-registered devices (which set only `pc_id`) appear. Path: `app/api/devices/route.ts`.
2. **TypeScript types** — Regenerate `lib/supabase/database.types.ts` from linked project so `devices` includes `serial_number`, `connection_id`, `pc_id`, `last_heartbeat`.
3. **Live DB** — Run `docs/verify_schema_handoff.sql` (or `supabase/schema_check_handoff.sql`) against the linked project and apply any missing migrations if needed.

---

## 3. Architecture & process — OK

- **Flow:** Registration (POST /api/devices) → heartbeat (list → resolve → batchUpsert + markOffline) → getDeviceTargetForTaskDevice (connection_id first) → claim → runTaskDevice → screenshot on complete, optimize on connect, portrait fix. Matches doc.
- **Boot order:** Matches MODULES.md and `docs/agent-js-modules-and-layers.md` (Core → Task → Heartbeat → Setup → Scheduling → DeviceOrchestrator).
- **Connection target for runTaskDevice (implemented):** Task-executor now resolves the Xiaowei/ADB target with `getDeviceTargetForTaskDevice(taskDevice)` and uses `connectionTarget` for `_watchVideoOnDevice` and `_shouldWarmup`.

---

## 4. Commands & logs — OK

- **Execution logs:** `supabase-sync.insertExecutionLog` → batch buffer → flush to `execution_logs`; task-executor and device-orchestrator write logs. Migration `20260228110000_execution_logs.sql` defines the table.
- **Screenshot path:** `config.loggingDir` (default `c:\logging` on Windows); filename pattern `dateTime-cumulativeCount` in `device/screenshot-on-complete.js` (e.g. `2026-02-28T14-30-00-003.png`). Device-orchestrator calls `takeScreenshotOnComplete(this.xiaowei, serial, nextDailyCount, this.loggingDir)` after successful runTaskDevice.
- **RPCs:** All used RPCs exist in migrations (see §2).

---

## 5. Web API — OK (with §2 GET fix)

- **POST /api/devices:** Accepts `serial_number`, `connection_id` (required), `worker_id` (optional). Inserts into `devices` with `serial`, `status: "offline"`. Consistent with the doc; GET filter fix above will align list view with agent-registered devices.

---

## Summary

| Area | Status | Action |
| ------ | -------- | -------- |
| Executables & require chain | OK | None |
| Schema (migrations) | OK | Regenerate types + live DB check (§2) |
| Architecture & process | OK | getDeviceTargetForTaskDevice wired in task-executor (§3) |
| Commands & logs | OK | None |
| Web API | OK | GET /api/devices filter by pc_id OR worker_id (§2) — done |

**Concrete fixes:**

1. **app/api/devices/route.ts** — Done. GET now filters by `pc_id` OR `worker_id` so agent-registered devices are included.
2. **lib/supabase/database.types.ts** — Regenerate from linked Supabase project: `npx supabase gen types typescript --linked > lib/supabase/database.types.ts`.
3. **agent/task/task-executor.js** — Done. Uses `getDeviceTargetForTaskDevice(taskDevice)` for `connectionTarget` and passes it to `_watchVideoOnDevice` and `_shouldWarmup`.
4. **Live DB** — Run schema verification SQL (`docs/verify_schema_handoff.sql` or `supabase/schema_check_handoff.sql`) and apply any missing migrations (see `MIGRATION_ORDER.md`).

After these, the stack is consistent for Electron packaging and remote-update client work: no missing files, no schema drift from agent expectations, and end-to-end data flow (devices, task_devices, logs, screenshots) aligned with the baseline doc.
