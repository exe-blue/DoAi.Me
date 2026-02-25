# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

DoAi.Me is a YouTube automated view-farming system with two main components:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Next.js Web Dashboard** | root `/` | Operator dashboard (port 3000) |
| **Node.js Agent** | `agent/` | Device controller (Windows-only, runs on PCs with phones) |

The web dashboard is the primary service to run in cloud dev. The agent is Windows-only and depends on Xiaowei hardware; it can be TypeScript-compiled but not functionally run.

### Running the web dashboard

```bash
npm run dev        # starts Next.js on http://localhost:3000
```

The dashboard requires Supabase credentials in `.env.local` (see `.env.example`). Without valid credentials the UI still renders but data fetches return empty/error states. The middleware redirects unauthenticated users to `/login` for all `/dashboard/*` routes.

### Key commands

See `package.json` scripts. Summary:

- **Lint:** `npm run lint`
- **Unit tests:** `npm test` (Vitest, 25 tests in `tests/`)
- **Agent build:** `cd agent && npm run build` (TypeScript compilation)
- **Dev server:** `npm run dev`

### Non-obvious caveats

- The `.env.local` file is required for the dev server. The update script copies `.env.example` as a fallback, but for real Supabase connectivity the three secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) must be injected as environment variables. When these env vars are present, regenerate `.env.local` from them before starting the dev server:
  ```bash
  printf 'NEXT_PUBLIC_SUPABASE_URL=%s\nNEXT_PUBLIC_SUPABASE_ANON_KEY=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\n' \
    "$NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_ANON_KEY" "$SUPABASE_SERVICE_ROLE_KEY" > .env.local
  ```
- Without valid Supabase credentials: the UI still renders, the middleware gracefully skips auth, and login attempts show "Failed to fetch" errors. With valid credentials: the middleware enforces auth redirects (`/dashboard/*` → `/login?returnTo=...`) and login form submissions reach the Supabase API.
- The agent (`agent/`) has its own separate `package.json` and `package-lock.json`. Run `npm install` in both the root and `agent/` directories.
- `npm workspaces` are defined (`apps/*`, `packages/*`) but the root `npm install` covers those automatically.
- Vitest tests do NOT require Supabase or any external services; they mock all DB calls.
- The `@doai/dashboard` workspace app (`apps/dashboard/`) is a WIP secondary dashboard on port 3001.
- After restarting the dev server (e.g. changing `.env.local`), the first page load can take ~10 seconds to compile.
