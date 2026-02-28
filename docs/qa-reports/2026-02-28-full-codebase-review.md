# Full codebase review — 2026-02-28

**Scope:** app/, lib/, agent/, components/, hooks/, tests/, scripts/, docs/, root config. Excluded: node_modules, .next, build/cache.

---

## 1. Test plan suggestion

| Level | Focus | Tool / Command |
|-------|--------|----------------|
| **E2E** | Login → dashboard, task create → device assignment, channels → video list | Playwright or `npm run test:e2e` (e2e-local.js) |
| **Unit** | lib/db/*, lib/mappers.ts, lib/pipeline.ts, API route handlers | Vitest (`npm test`) |
| **Feature** | YouTube register-channels, sync-channels cron, dispatch-queue, agent task_devices flow | Vitest + e2e-local.js task_devices path |

**Critical paths to cover:**  
- Channels CRUD and videos insert (correct column names: `channels.name`, `profile_url`, `is_monitored`).  
- Task creation → task_devices → agent poll → completion.  
- No `.update()` on `job_assignments` including `updated_at` (schema has no such column).

---

## 2. Bugs found

### 2.1 Wrong DB column names / payload (channels) — **High**

| Location | Issue | Dependency / Impact |
|----------|--------|----------------------|
| **tests/seed-e2e-mvp.js** | Channel payload uses `youtube_channel_id`, `channel_name`, `channel_url`, `monitoring_enabled` and `onConflict: "youtube_channel_id"`. Per project rules and `lib/db/channels.ts`, channels table uses `id`, `name`, `profile_url`, `is_monitored` and PK `id`. | Seed fails or misinserts when run for E2E. Depended on by: E2E flow (e2e-local.js). |

**Fix:** In `seed-e2e-mvp.js`, change channel payload to: `id`, `name`, `profile_url`, `is_monitored` and use `onConflict: "id"`. Map `REAL_YT_CHANNEL.youtube_channel_id` → `id`, `channel_name` → `name`, `channel_url` → `profile_url`, `monitoring_enabled` → `is_monitored`. Same for the random channel payload.

### 2.2 Inconsistent Supabase server client naming — **Low**

| Location | Issue |
|----------|--------|
| **lib/supabase/server.ts** | Exports both `createSupabaseServerClient` and `getServerClient` (alias). API routes use either name. |
| **app/api/** | Some routes use `getServerClient()`, others `createSupabaseServerClient()`. |

**Fix:** Standardize on one name (e.g. `getServerClient`) and use it everywhere, or document when to use which.

### 2.3 job_assignments.updated_at — **Verified OK**

- No code path performs `.update()` on `job_assignments` with `updated_at`. All usages are `.from("job_assignments").select(...)`.  
- Other tables (devices, accounts, scripts, videos, etc.) that use `updated_at` in `.update()` match `lib/supabase/database.types.ts` and are fine.

### 2.4 devices table column naming (docs vs code)

- **Project rules** say: `serial_number`, `last_heartbeat`.  
- **lib/supabase/database.types.ts** (generated) has: `serial`, `last_seen` for devices.  
- **tests/seed-e2e-mvp.js** uses `serial` and `last_seen` → consistent with current types.  
- **Recommendation:** Align project rules with actual schema (or regenerate types from DB) so `serial_number`/`last_heartbeat` vs `serial`/`last_seen` is unambiguous.

---

## 3. Unused / redundant files

### 3.1 Orphan components (no app imports)

- **components/overview/** — `health-bar.tsx`, `stat-cards.tsx`, `activity-feed.tsx`, `health-report.tsx`, `worker-detail.tsx`. Not imported anywhere; dashboard uses inline cards + `Widget` + `SecurityStatus`. **Recommendation:** Remove or move to `_archive` if keeping for reference.
- **components/channels-page.tsx** — Exports `ChannelsPage`; app uses `(app)/content/channels/channels-content.tsx` only. Only referenced in docs. **Recommendation:** Keep for now (docs/ARCHITECTURE reference) or archive.
- **components/logs-page.tsx** — Same pattern; app uses `LogsContent`. **Recommendation:** Same as channels-page.
- **components/presets-page.tsx** — Not imported; `/automation/presets` redirects to scripts. **Recommendation:** Same as above.

### 3.2 Orphan route (deleted)

- **register-channels-fixed/route.ts** (root) — Standalone route not under `app/api/`; Next.js does not serve it. Duplicate of `app/api/youtube/register-channels/route.ts`. **Action:** Deleted (folder removed).

### 3.3 Redundant docs (deleted)

- **_archive/docs-duplicate/** — Full duplicate of `docs/` (architecture, ENV, FOLDER_STRUCTURE, known-issues, plans, xiaowei-api, etc.). **Action:** Deleted to avoid duplication.

### 3.4 Recommended keep (do not delete)

- **packages/supabase/** — Workspace package; referenced in package-lock and possibly by tooling. Keep.
- **agent/** — All production JS; no product code removed.
- **_archive/legacy-yt-modules, _archive/agent-src-bak, _archive/cursor-prompts, _archive/migration-scripts** — Kept as archive; only docs-duplicate removed.
- **_cleanup_report.md** — Previous cleanup analysis; keep for history.

---

## 4. Files deleted this pass

| Path | Reason |
|------|--------|
| **register-channels-fixed/route.ts** | Orphan route at repo root; duplicate of app/api/youtube/register-channels. |
| **register-channels-fixed/** (folder) | Contained only the above file. |
| **_archive/docs-duplicate/** (entire directory) | Duplicate of docs/; canonical content lives in docs/. |

---

## 5. Summary for the team

- **Bugs:** 1 high (seed-e2e-mvp channel columns + onConflict), 1 low (server client naming), plus a docs/schema clarification for devices columns.
- **Deleted:** 1 orphan folder (`register-channels-fixed/`) and the duplicate doc tree `_archive/docs-duplicate/`.
- **Test plan:** E2E for dashboard + task/channel flows; unit for lib/db and mappers; feature for register-channels, sync-channels, dispatch-queue, and agent task_devices.
- **Critical items:**  
  1. Fix **tests/seed-e2e-mvp.js** channel payload and onConflict so E2E seed works against real schema.  
  2. Resolve **devices** column naming in project rules vs database.types (serial/serial_number, last_seen/last_heartbeat).  
  3. Optionally standardize **getServerClient** vs **createSupabaseServerClient** and archive or remove unused **components/overview/** and legacy **components/*-page.tsx** if no longer needed.
