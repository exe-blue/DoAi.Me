# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

pnpm workspaces + Turborepo. Three deployable apps and two shared packages:

| App | Path | Purpose |
|-----|------|---------|
| `@doai/web` | `apps/web/` | Next.js 15 dashboard (Vercel) |
| `@doai/desktop` | `apps/desktop/` | Electron agent controller (Windows .exe) |
| Legacy agent | `agent/` | Root-level Node.js CommonJS agent (Windows PCs) |

| Package | Path | Purpose |
|---------|------|---------|
| `@doai/shared` | `packages/shared/` | Shared TypeScript types and guards |
| `@doai/supabase` | `packages/supabase/` | Shared Supabase DB types |
| `@doai/typescript-config` | `packages/config/typescript/` | Shared TS compiler configs |

## Commands

All commands from the repo root unless noted.

```bash
# Development
pnpm run dev                          # all apps via Turborepo
pnpm --filter @doai/web run dev       # web only (port 3000)
pnpm --filter @doai/desktop run dev   # Electron dev mode

# Build & type-check
pnpm run build                        # all apps
pnpm run typecheck                    # all apps
pnpm --filter @doai/web run typecheck

# Lint
pnpm run lint

# Unit tests (Vitest, mocks all Supabase — no external services needed)
pnpm run test                         # all workspaces
pnpm --filter @doai/web run test      # web only

# E2E (requires running Agent + Xiaowei on ws://localhost:22222 + seeded DB)
pnpm --filter @doai/web run test:e2e

# Desktop Windows installer
pnpm run dist                         # builds win NSIS .exe → apps/desktop/release/

# Legacy agent
cd agent && npm install && npm start  # production
cd agent && npm run dev               # tsc --watch
```

## Web App (`apps/web`)

**Source layout** — Next.js App Router pages/API live in `apps/web/app/`; everything else (components, hooks, lib) lives in `apps/web/src/`:

```
apps/web/
├── app/
│   ├── api/          # 60+ API route handlers
│   ├── (app)/        # authenticated route group
│   └── layout.tsx / page.tsx
└── src/
    ├── components/   # UI components (shadcn/ui + custom)
    ├── lib/
    │   ├── supabase/ # clients + generated types
    │   ├── db/       # server-side query helpers (channels, videos, tasks, schedules)
    │   ├── types.ts  # frontend types (Device, NodePC, TaskVariables…)
    │   ├── mappers.ts
    │   └── pipeline.ts / dispatch-queue-runner.ts / sync-channels-runner.ts
    └── services/     # youtubeService, operationsService, eventsService
```

**Path alias**: `@/*` maps to `apps/web/src/*` (via `tsconfig.json` paths). Use `@/lib/…`, `@/components/…` etc. The `app/` directory (API routes, pages) is not under `src/`, so it does not go through the `@` alias — use relative imports or `baseUrl`-relative paths for cross-directory references.

## Desktop App (`apps/desktop`)

Electron 33 app — renders a local React + MUI UI (not shadcn/ui) in the renderer process. The Node.js agent (`src/agent/`) is bundled as `extraResources` and spawned by `src/main/agentRunner.ts`. Windows-only NSIS build; no mac/linux targets.

## Supabase Patterns (Critical)

**Client selection**:

| Context | Function | File |
|---------|----------|------|
| API routes (admin, bypasses RLS) | `createServiceRoleClient()` / `getServerClient()` | `src/lib/supabase/server.ts` |
| Server Components with auth session | `createServerClientWithCookies()` | `src/lib/supabase/server.ts` |
| Browser / Client Components | `createBrowserClient()` | `src/lib/supabase/client.ts` |

> **Note**: `src/lib/supabase/client.ts` is the canonical browser client — it returns `null` gracefully when env vars are missing. `browser.ts` is a legacy version that throws; prefer `client.ts` for all new code.

**Types**: `src/lib/supabase/database.types.ts` is auto-generated. Never edit it manually.
Regenerate with:
```bash
npx supabase gen types typescript --project-id dpjtucajnnqvtdwcqlha > apps/web/src/lib/supabase/database.types.ts
```
`src/lib/supabase/types.ts` re-exports `Database` and provides convenience aliases (`WorkerRow`, `DeviceRow`, `TaskRow`, `TaskDeviceRow`, etc.) used across the codebase.

**Query rule**: Always call `.returns<T>()` on Supabase queries — generic type inference fails without it.

## DB Execution Model (SSOT)

The real execution primitive is **`task_devices`**, not `tasks`. Tasks are logical groupings; `task_devices` rows are what the agent claims and runs (one row = one device execution).

State transitions happen only through these RPCs:
- `claim_task_devices_for_pc(runner_pc_id, max_to_claim, lease_minutes)` — queued → running
- `renew_task_device_lease(task_device_id, runner_pc_id, lease_minutes)` — extend lease (every 30s)
- `complete_task_device(task_device_id, runner_pc_id, result_json)` — running → completed
- `fail_or_retry_task_device(task_device_id, runner_pc_id, error_text, retryable)` — retry or failed

**Script execution rules** (enforced by code and DB):
1. Always pin `(scriptId, version)` / `(workflowId, version)` — no "latest" auto-selection
2. Publish creates a snapshot in `task_devices.config.snapshot` — agent uses this, not the live DB script
3. `scripts.status = 'active'` is required; draft/archived scripts are rejected at publish and execution time

## Environment Variables

Web (`.env.local` in `apps/web/`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser client
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, never exposed to browser
- `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` — Supabase SDK keys
- `SUPABASE_ACCESS_TOKEN` — Supabase CLI / MCP personal access token
- `YOUTUBE_API_KEY`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`

Agent (`.env` in `agent/` or `apps/desktop/src/agent/`):
- `WORKER_NAME`, `PC_NUMBER` — agent identity
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — note: agent uses `SUPABASE_URL`, not `NEXT_PUBLIC_SUPABASE_URL`
- `XIAOWEI_WS_URL`, `HEARTBEAT_INTERVAL`, `TASK_POLL_INTERVAL`, `MAX_CONCURRENT_TASKS`

## Key Architectural Decisions

- **Device control**: Xiaowei WebSocket API at `ws://127.0.0.1:22222/` (Windows-only). The agent on each Node PC connects to this and relays commands from Supabase.
- **Realtime**: Supabase Broadcast via DB triggers (`pg_net` HTTP post). Topics: `room:tasks`, `room:task:<id>:logs`, `room:task_logs`, `room:workers`, `room:devices`.
- **Proxy 1:1**: `devices.proxy_id` and `proxies.device_id` are both UNIQUE — one proxy per device enforced at DB level.
- **`devices.connection_id`**: Xiaowei target identifier. Agent resolves `connection_id ?? serial` when sending commands.
- **Migration files ≠ actual DB**: `supabase/migrations/` was the starting point but the production schema has evolved. Regenerate types from the live project (`dpjtucajnnqvtdwcqlha`) rather than inferring from migration files.
