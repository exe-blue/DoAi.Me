# DoAi.Me — Data Workflow, Table Usage, and Legacy Artifacts

**Purpose**: Single source for data flow (YouTube → tasks → task_devices), table usage by Agent vs Dashboard, and legacy/conflicting artifacts.  
**SSOT for assignment**: **task_devices** only (not "tasks_devices" — the table name is `task_devices`).

---

## 1. Workflow: Data Source → Tasks → task_devices → Agent/Dashboard

### 1.1 "takss" Clarification

**"takss" is a typo.** There is no table named `takss`. The actual table is **`tasks`**. All task-related flow uses `tasks` and **`task_devices`**.

### 1.2 Where YouTube Data Comes From

| Data | Source table/entity | How it gets there |
|------|---------------------|--------------------|
| **YouTube URLs** | `videos` (id = video UUID), derived URL in code | Dashboard/API: manual add, or sync from YouTube API → `videos`. URL built as `https://www.youtube.com/watch?v=${videoId}` (videoId from `videos.id` or `youtube_video_id` depending on usage). |
| **Keywords** | `videos.title` or `task_config.keyword` / payload | Video title used as keyword in trigger (`fn_create_task_devices_on_task_insert`); sync/queue can set `keyword` in `task_config`. |
| **Titles** | `videos.title` | From YouTube API sync or manual entry; task trigger reads `videos.title` for task_device config. |
| **View counts** | `videos.view_count` | From YouTube API (channel sync); used for display/priority, not for assignment. |

**Source of truth for “content to run”**: **`videos`** (and optionally **`task_queue.task_config`**). Tasks reference `tasks.video_id` → `videos.id`. The trigger builds per-device config from **tasks** + **videos** (title, keyword, duration, watch %, like/comment prob, etc.).

### 1.3 End-to-End Flow (Text Diagram)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DATA SOURCES                                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ • channels     (YouTube channel metadata; sync or manual)                   │
│ • videos       (title, view_count, duration_sec, prob_*, etc.; sync/manual)  │
│ • task_queue   (optional) task_config with video_id, keyword, video_url      │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ TASK CREATION (Dashboard / Cron / Agent QueueDispatcher)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Manual:  POST /api/tasks or /api/tasks/quick → tasks INSERT               │
│ • Batch:   POST /api/tasks (contentMode batch) → tasks INSERT                │
│ • Queue:   POST /api/queue → task_queue INSERT                              │
│ • Cron:    GET /api/cron/dispatch-queue → dequeue_task_queue_item → tasks    │
│ • Agent:   QueueDispatcher polls/Realtime → tasks INSERT from task_queue     │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ SERVER-SIDE (Supabase) — SSOT for assignment                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ • ON tasks INSERT: fn_create_task_devices_on_task_insert()                   │
│   - Reads task.payload + videos (title, duration_sec, watch_*_pct,           │
│     prob_like, prob_comment)                                                 │
│   - Inserts task_devices: one row per device (per PC, up to device_count)    │
│   - Only devices on PCs that do NOT already have pending/running             │
│     task_devices (PC별 1개)                                                   │
│ • Optional: fn_add_task_device_for_new_device (late-join, pending only)      │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ task_devices (ONLY assignment SSOT)                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Rows: one per (task, device) on a PC; status: pending | running |          │
│   completed | failed | canceled | timeout                                    │
│ • Assignment: Agent calls claim_task_devices_for_pc(pc_number, max_to_claim)  │
│   → rows become running, lease_expires_at set                                │
│ • Progress: complete_task_device / fail_or_retry_task_device / renew lease   │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
          ┌────────────────────────────┴────────────────────────────┐
          ▼                                                          ▼
┌─────────────────────────────┐                    ┌─────────────────────────────┐
│ WINDOWS AGENT (per PC)       │                    │ NEXT.JS DASHBOARD           │
├─────────────────────────────┤                    ├─────────────────────────────┤
│ • Reads: pcs, devices,       │                    │ • Reads: tasks, task_devices,│
│   task_devices, tasks,       │                    │   task_logs, devices,       │
│   task_queue, task_schedules,│                    │   workers/pcs, channels,    │
│   settings, proxies,        │                    │   videos, task_queue,       │
│   accounts, videos (config)  │                    │   task_schedules, presets,  │
│ • Writes: devices (heartbeat,│                    │   accounts, proxies,       │
│   status), task_devices      │                    │   job_assignments (legacy)  │
│   (via RPC: claim, complete,│                    │ • Writes: tasks, task_queue,│
│   fail, renew), task_logs,   │                    │   task_schedules, devices, │
│   execution_logs             │                    │   channels, videos, presets, │
│ • No assignment logic        │                    │   accounts, proxies,       │
│   outside task_devices RPCs  │                    │   settings, command_logs   │
└─────────────────────────────┘                    └─────────────────────────────┘
```

### 1.4 Assignment Rule (No Duplicate Logic)

- **Only** `task_devices` and its RPCs (`claim_task_devices_for_pc`, `complete_task_device`, `fail_or_retry_task_device`, `renew_task_device_lease`) define who does what on which device.
- The **dashboard** does **not** assign devices to work; it creates **tasks** (and optionally **task_queue** items). Supabase creates **task_devices** via trigger; the **agent** claims and runs from **task_devices** only.
- **job_assignments** (and any **jobs** table) are **not** used for assignment by the current agent or by the task_devices pipeline; they are legacy (see Section 3).

---

## 2. Table/Entity Usage Matrix

Tables/entities inferred from: `supabase/migrations`, `lib/db`, `app/api`, `agent/**/*.js`, and `lib/supabase/database.types.ts`.

| Table/Entity | Used by Agent? | Used by Dashboard? | Legacy/Unused? | Notes |
|--------------|----------------|---------------------|----------------|-------|
| **accounts** | Yes (read: account-manager) | Yes (API: accounts, dashboard/accounts) | No | Agent reads for device–account assignment; dashboard CRUD. |
| **channels** | No | Yes (API: channels, sync, stats) | No | YouTube channel list and sync. |
| **command_logs** | No | Yes (API: commands) | No | Command history. |
| **commands** | No | Yes (indirect via command_logs/commands API) | No | Created in migrations; agent may write via command path. |
| **devices** | Yes (read/write: supabase-sync, heartbeat, device-orchestrator, etc.) | Yes (API: devices, workers, overview, proxies, etc.) | No | Core entity; agent updates status/heartbeat. |
| **execution_logs** | Yes (write: supabase-sync) | No (no API found) | Dashboard: unused | Agent-only logs. |
| **job_assignments** | **No** | Yes (read-only: dashboard/missions, screenshots, realtime) | **Legacy** | Dashboard still reads for missions/screenshots/counts; agent uses task_devices only. |
| **jobs** | **No** | **No** | **Legacy** | Referenced in e2e diagnostic migration only; no CREATE TABLE in repo. |
| **pcs** | Yes (read/write: supabase-sync, device-orchestrator, overview) | Yes (API: overview, agents health, realtime) | No | Node PC identity; agent registers/heartbeats. |
| **presets** | No | Yes (API: presets) | No | Xiaowei preset configs. |
| **proxies** | Yes (read/write: proxy-manager) | Yes (API: proxies, dashboard/proxies) | No | Agent applies proxy to devices. |
| **schedules** | No | Yes (API: schedules) | No | Old schedules table (see task_schedules). |
| **scripts** | No | Yes (API: scripts) | No | Xiaowei scripts. |
| **settings** | Yes (read: config.js) | Yes (API: settings) | No | Dynamic agent/dashboard settings. |
| **system_config** | No | No | Unused in code | Created in migration (offline_threshold, etc.); not yet wired. |
| **system_events** | No | No | Unused in code | Created in repair_schema; no API/agent usage found. |
| **task_devices** | Yes (claim/complete/fail/renew via RPC; read config) | Yes (API: tasks/[id]/devices, retry, quick) | No | **SSOT for assignment.** |
| **task_logs** | Yes (write: task-executor, supabase-sync) | Yes (API: logs, health, dashboard/errors) | No | Per-task execution logs. |
| **task_queue** | Yes (read: queue-dispatcher; dequeue) | Yes (API: queue, cron/dispatch-queue) | No | Priority queue; dispatch creates tasks. |
| **task_schedules** | Yes (read: schedule-evaluator) | Yes (API: schedules, queue trigger) | No | Cron-like schedules → task_queue. |
| **tasks** | Yes (read: queue-dispatcher, stale-task-cleaner, task-executor) | Yes (API: tasks, stats, overview, etc.) | No | Logical job; trigger creates task_devices. |
| **videos** | Yes (read: task-executor for config) | Yes (API: channels/videos, sync, missions) | No | YouTube video metadata; source for title/keyword/view count. |
| **workers** | Yes (read: supabase-sync, heartbeat) | Yes (API: workers, stats, overview) | No | Legacy worker identity; some code still uses workers. |
| **workflows** / **workflows_definitions** | No | Yes (API: workflows) | No | Workflow definitions (names differ in migrations). |
| **app_users** | No | No | Unused in code | Created in migrations; no API/agent usage. |
| **screenshots** | No | No | Unused in code | In database.types; no API found. |
| **dashboard_summary** (view) | No | Yes (if used by dashboard UI) | No | View over pcs + devices. |

**Summary for “never read or written by current agent or dashboard” (candidates for removal/archival):**

- **system_events** — not referenced in app or agent.
- **app_users** — not referenced in app or agent.
- **screenshots** — in types only; no API usage found.
- **system_config** — migration creates it; not yet used in code.

**job_assignments**: Read by dashboard only; agent does not use it. **jobs**: Only in e2e diagnostic migration; no CREATE in repo; no app/agent usage.

---

## 3. Legacy and Conflicting Artifacts

### 3.1 job_assignments

| Item | Location | In app/agent? | Recommendation |
|------|----------|----------------|----------------|
| **job_assignments** table | Migrations: 20260225100000, 20260225110000, 20260225200000, run_step6_and_step7, e2e diagnostic | **Dashboard only** (read): `app/api/dashboard/missions/route.ts`, `app/api/dashboard/screenshots/route.ts`, `app/api/dashboard/realtime/route.ts` | **Legacy – safe to deprecate.** Migrate missions/screenshots/realtime to use **task_devices** (completed_at, result, status); then deprecate or drop job_assignments. |

### 3.2 jobs

| Item | Location | In app/agent? | Recommendation |
|------|----------|----------------|----------------|
| **jobs** table | Referenced in `20260225000000_e2e_diagnostic_queries.sql` (FROM jobs, INSERT into job_assignments with job_id); **no CREATE TABLE jobs** in repo | **No** app or agent code references | **Legacy.** If the table exists in DB, it was created outside these migrations. Safe to deprecate/remove after job_assignments is migrated and e2e diagnostics are updated. |

### 3.3 claim_next_assignment (RPC on job_assignments)

| Item | Location | In app/agent? | Recommendation |
|------|----------|----------------|----------------|
| **claim_next_assignment** | 20260226220000_claim_next_assignment_use_serial.sql, 20260225110000, 20260225100000 | **No** — agent uses `claim_task_devices_for_pc` only | **Deprecate.** Replaced by claim_task_devices_for_pc; safe to drop after job_assignments is retired. |

### 3.4 Other Assignment / Progress Tables

- **task_devices**: This is the **only** assignment/progress table in active use. No other table (tasks, task_queue, job_assignments, jobs) is used by the agent for claiming or running work.
- **devices** columns like `current_assignment_id`, `task_status`, `watch_progress`, `daily_watch_count`, `daily_watch_seconds`: Used for **display/orchestrator state** (e.g. dashboard_summary view, device-orchestrator sync). They do **not** drive assignment; assignment is driven by **task_devices** and RPCs.

### 3.5 Summary Recommendations

| Artifact | Recommendation |
|----------|----------------|
| **job_assignments** | **Deprecate.** Move dashboard missions/screenshots/realtime to task_devices; then drop or archive. |
| **jobs** | **Deprecate.** If present in DB, remove after job_assignments is migrated; update e2e diagnostic migration/docs. |
| **claim_next_assignment** RPC | **Remove** after job_assignments is deprecated. |
| **task_devices** + claim/complete/fail RPCs | **Keep** — SSOT. |
| **system_events**, **app_users**, **screenshots** (if unused) | **Evaluate** for archival or removal; low priority. |
| **system_config** | **Keep** for future use (e.g. offline_threshold); document intended use. |

---

## 4. Quick Reference

- **Table name**: **task_devices** (not "tasks_devices").
- **"takss"**: Typo; use **tasks**.
- **YouTube data**: **channels** + **videos** (titles, keywords, view counts); task config from **tasks.payload** + **videos** in trigger.
- **Assignment**: Only **task_devices** and its RPCs; no duplicate assignment logic elsewhere.
- **Dashboard** still **reads** **job_assignments** for three routes; agent does **not** use job_assignments or jobs.
