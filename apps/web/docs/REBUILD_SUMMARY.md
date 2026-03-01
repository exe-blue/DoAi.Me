# Web Dashboard Rebuild Summary

New Materio(MUI)-based dashboard: Operations, YouTube (Channels/Contents), Events/Logs, Settings only. No DB/API/schema changes; data access via service adapters (existing API or stub+TODO).

---

## 1. Deleted / Modified Files

### Deleted (old routes)

- `app/(app)/dashboard/` — entire folder (page, dashboard-content)
- `app/(app)/infrastructure/` — pcs, devices, network, proxies pages
- `app/(app)/content/` — channels, content, tasks, schedules, completed pages
- `app/(app)/automation/` — adb, presets, scripts, workflows pages
- `app/(app)/system/` — settings, logs, errors, accounts pages

### Modified

- `app/(app)/layout.tsx` — now uses `MuiTheme` + `DashboardLayout` (Materio-style sidebar)
- `app/page.tsx` — authenticated redirect changed from `/dashboard` to `/ops`
- `package.json` — added `@emotion/react`, `@emotion/styled`, `@mui/material`, `@mui/icons-material`

### Created

- `src/services/types.ts` — assumption-only UI types (OperationsKpi, YoutubeChannel, EventLogItem, etc.)
- `src/services/operationsService.ts` — KPIs, alerts, workers, devices (uses `/api/stats`, `/api/overview`, `/api/workers`, `/api/devices`, `/api/dashboard/errors`)
- `src/services/youtubeService.ts` — channels + contents (GET/POST `/api/channels`), registerChannel, deleteChannel/createContent stubs
- `src/services/eventsService.ts` — event logs (GET `/api/logs`), error summary (GET `/api/dashboard/errors`)
- `src/services/settingsService.ts` — GET/PUT `/api/settings`
- `lib/materio-layout/MuiTheme.tsx` — MUI ThemeProvider + CssBaseline (dark, primary #7367f0)
- `lib/materio-layout/DashboardLayout.tsx` — sidebar + main area, Next.js Link + usePathname (routing only in apps/web)
- `app/(app)/ops/page.tsx` — Operations: KPI cards, alerts, device search/table
- `app/(app)/youtube/channels/page.tsx` — Channels list, register (disabled + TODO), delete (stub)
- `app/(app)/youtube/contents/page.tsx` — Contents list, add content (disabled + TODO)
- `app/(app)/events/page.tsx` — Event logs table, level/search filters, detail dialog (JSON)
- `app/(app)/settings/page.tsx` — Settings table (read-only display; save uses existing PUT when available)

### Preserved (no change)

- `app/layout.tsx`, `app/providers.tsx`, `middleware.ts`, `next.config.*`, auth callback/logout, login, landing (LandingNavigation, HeroSection, BentoGrid), `app/api/**` (all routes), `lib/api.ts`, `lib/supabase/**`, `components/ui/**`, `components/landing/**`, `components/theme-provider.tsx`, `components/auth/**`

---

## 2. Assumption-Only Data Fields (no schema guarantee)

| Area | Field | Note |
|------|--------|------|
| Operations KPI | `lastHeartbeatAt` | Single “last heartbeat” — API does not expose this; currently null. TODO: assume endpoint or aggregate from workers. |
| Operations KPI | `recentSuccessCount` / `recentFailureCount` | Mapped from `/api/stats` tasks.completed / tasks.failed (counts, not “recent” window). |
| Operations alerts | `heartbeat mismatch`, `unauthorized` | Not implemented. TODO: assume APIs for heartbeat mismatch and unauthorized device list. |
| YouTube channels | `lastCollectedAt`, `status`, `isMonitored`, `videoCount` | From existing channels API response; shape assumed. |
| YouTube contents | `status`, `thumbnailUrl`, `channelName` | From existing channels API (contents array); shape assumed. |
| Events | `level`, `message`, `task_id`, `device_serial` | From `/api/logs` (task_logs); raw row as `raw`. |
| Settings | `key`, `value`, `description`, `updated_at` | From GET `/api/settings`; value parsed from JSON. |

---

## 3. TODO List (stub / not implemented)

- **operationsService**: `lastHeartbeatAt` — assume API or aggregate from workers when available.
- **operationsService**: Alerts for “heartbeat mismatch” and “unauthorized” — assume endpoints; currently only dashboard/errors used.
- **youtubeService**: `deleteChannel(id)` — TODO: wire to DELETE `/api/channels/[id]` when that endpoint exists.
- **youtubeService**: `createContent(payload)` — TODO: wire to content/video creation API when available.
- **UI**: YouTube Channels — “Register channel” button disabled; enable when POST `/api/channels` contract is confirmed.
- **UI**: YouTube Contents — “Add content” disabled; enable when creation API exists.
- **UI**: Settings — Edit/save: use existing PUT `/api/settings` when adding form; currently read-only display.

---

## 4. New IA & Routing (App Router)

- **Operations**: `/ops` — KPI cards, alerts, device search/table.
- **YouTube**: `/youtube/channels`, `/youtube/contents` — channels list + register/delete (stub); contents list + add (stub).
- **Events/Logs**: `/events` — event list, filters, detail (JSON).
- **Settings**: `/settings` — settings table (env/server URL, etc.).

Sidebar: Operations, YouTube — Channels, YouTube — Contents, Events / Logs, Settings. Routing handled only in apps/web (Next.js Link + usePathname). Layout lives under `lib/materio-layout/` for future move to `packages/ui` if desired.

---

## 5. Verification: Run Web

```bash
pnpm -w dev
```

- From repo root, this starts the Next.js dev server (e.g. port 3000).
- Open `http://localhost:3000` — unauthenticated: landing; authenticated: redirect to `/ops`.
- Visit `/ops`, `/youtube/channels`, `/youtube/contents`, `/events`, `/settings` to confirm new dashboard.
- No new API or DB changes; existing `/api/*` and auth/middleware unchanged.

Build (from repo root):

```bash
pnpm --filter @doai/dashboard build
```

Build has been run successfully (no new endpoints or migrations).
