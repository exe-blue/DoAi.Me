# DoAi.Me — CLAUDE.md

YouTube device farm management platform. Controls 500 Galaxy S9 phones across 5 Windows Node PCs via Xiaowei WebSocket API, orchestrated through a Next.js + Supabase serverless backend.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui
- **State**: Zustand 5, Supabase Realtime (Broadcast)
- **Backend**: Vercel serverless API Routes, Supabase PostgreSQL
- **Agent**: Node.js CommonJS (runs on Windows PCs), connects to Xiaowei WebSocket `ws://127.0.0.1:22222/`
- **Validation**: Zod
- **Tests**: Vitest (unit), `tests/e2e-local.js` (E2E)

## Commands

```bash
npm run dev          # Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run test:e2e     # E2E tests (requires running server)
npm run test:api     # API tests
npm run agent:dev    # Run agent in dev mode (from agent/)
npm run agent:start  # Run agent in production mode
npm run db:link      # Link Supabase project
npm run db:verify    # Verify DB schema
```

## Project Structure

```
app/api/          # 19 serverless API routes
agent/            # Node.js agent (runs on Windows PCs)
components/       # React UI components (shadcn/ui based)
hooks/            # Zustand stores + Realtime hooks (use-*-store.ts)
lib/
  supabase/       # server.ts (SERVICE_ROLE), client.ts (anon), types.ts
  db/             # Server-side query helpers (channels, videos, tasks, schedules)
  mappers.ts      # DB Row → Frontend Type conversions
  types.ts        # Frontend types (Device, NodePC, Task, etc.)
supabase/migrations/  # SQL migrations (may not match actual DB — see below)
scripts/          # Xiaowei AutoJS scripts
```

## Critical Patterns

- **Archive**: Docs in `_archive/` are not for current development; use only active docs (Critical/High/Reference per `docs/DOCS_MANAGER_UPDATES.md`) unless debugging or comparing versions.

### Supabase Queries
- **Always use `.returns<T>()`** on ALL Supabase queries — generic type inference fails without it
- Every table in the `Database` interface MUST have `Relationships: []` (even empty) or client types break
- Server client (`lib/supabase/server.ts`) uses `SUPABASE_SERVICE_ROLE_KEY`
- Browser client (`lib/supabase/client.ts`) uses the anon key

### Next.js 15 Dynamic Routes
- Dynamic route handlers need `params: Promise<{id: string}>` and `await params`

### Type System
- `lib/types.ts` — frontend types used in components
- `lib/supabase/types.ts` — DB row types used in API routes and stores
- Zustand stores in `hooks/use-*-store.ts` map DB rows → frontend types internally

## Database Gotchas

- **Actual DB uses enums** (not strings):
  - `task_type`: `preset | adb | direct | batch | youtube`
  - `task_status`: `pending | assigned | running | done | failed | cancelled | timeout | completed`
  - `log_level`: `debug | info | warn | error | fatal`
- **`task_logs` uses `level` NOT `status`** — agent maps success→info, error→error
- **Migration files ≠ actual DB**: Migrations are recorded as applied but real schema may differ. Do not trust migration files as ground truth.
- **`broadcast_to_channel()` trigger**: Uses `net.http_post` via pg_net. Must wrap in `BEGIN/EXCEPTION` to avoid blocking inserts on HTTP failure.
- **Supabase project ref**: `dpjtucajnnqvtdwcqlha`
- **Supabase CLI auth**: Use `SUPABASE_ACCESS_TOKEN` env var (non-TTY)

## Agent Architecture

The agent (`agent/`) runs on each Windows PC and:
1. Connects to Supabase Realtime to receive task assignments
2. Forwards commands to Xiaowei WebSocket (`ws://127.0.0.1:22222/`)
3. Reports results back to Supabase

Key modules:
- `agent.js` — main orchestrator
- `xiaowei-client.js` — WebSocket client with auto-reconnect
- `supabase-sync.js` — worker/device registration and task sync
- `heartbeat.js` — 30s device status sync
- `task-executor.js` — task type dispatch
- `device-orchestrator.js` — claim-based device assignment flow

## Env Vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
YOUTUBE_API_KEY
```

## API Routes Reference

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/workers` | GET | List workers with device counts |
| `/api/workers/[id]` | GET | Worker + devices |
| `/api/workers/heartbeat` | POST | Agent heartbeat |
| `/api/devices` | GET | List devices (filter by worker_id/status) |
| `/api/devices/[id]` | GET, PUT | Device detail/update |
| `/api/accounts` | GET, POST | YouTube accounts |
| `/api/presets` | GET, POST | Xiaowei presets |
| `/api/presets/[id]` | GET, PUT, DELETE | Preset CRUD |
| `/api/tasks` | GET, POST, PATCH, DELETE | Task queue |
| `/api/channels` | GET | Channels + videos |
| `/api/schedules` | GET, POST, PATCH, DELETE | Auto-scheduling |
| `/api/youtube/channels` | GET, POST | Channel management |
| `/api/youtube/videos` | GET | Recent videos |
| `/api/youtube/sync` | GET | Sync all channels |
| `/api/stats` | GET | Dashboard aggregations |
| `/api/logs` | GET | Paginated task logs |
| `/api/health` | GET | Health check |

## Realtime Channels

- `room:tasks` — task INSERT/UPDATE/DELETE broadcasts
- `room:task:<id>:logs` — per-task log stream
- `room:task_logs` — global log monitoring

Broadcast is driven by DB triggers via `pg_net` HTTP calls to Supabase Realtime API.
