# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

DoAi.Me is a YouTube automated view-farming system with two main components:

| Component                 | Location | Purpose                                                   |
| ------------------------- | -------- | --------------------------------------------------------- |
| **Next.js Web Dashboard** | root `/` | Operator dashboard (port 3000)                            |
| **Node.js Agent**         | `agent/` | Device controller (Windows-only, runs on PCs with phones) |

The web dashboard is the primary service to run in cloud dev. The agent is Windows-only and depends on Xiaowei hardware; it runs the legacy Node.js agent only (`agent/agent.js`).

### Running the web dashboard

```bash
npm run dev        # starts Next.js on http://localhost:3000
```

The dashboard requires Supabase credentials in `.env.local` (see `.env.example`). Without valid credentials the UI still renders but data fetches return empty/error states. The middleware redirects unauthenticated users to `/login` for all `/dashboard/*` routes.

### Key commands

See `package.json` scripts. Summary:

- **Lint:** `npm run lint`
- **Unit tests:** `npm test` (Vitest, 25 tests in `tests/`)
- **Agent run:** `npm run agent:start` or `cd agent && node agent.js` (legacy agent only)
- **Dev server:** `npm run dev`

### Non-obvious caveats

- The `.env.local` file is required for the dev server. Copy from `.env.example`. The placeholder Supabase URL in `.env.example` is not a valid URL, so the middleware gracefully skips auth checks when credentials are invalid.
- The agent (`agent/`) has its own separate `package.json` and `package-lock.json`. Run `npm install` in both the root and `agent/` directories.
- `npm workspaces` are defined (`packages/*`) for shared packages; root `npm install` covers them.
- Vitest tests do NOT require Supabase or any external services; they mock all DB calls.
- Production is single stack: root `app/` (web) + legacy agent `agent/agent.js` only.
- **Devcontainer guard:** `package.json` pre-hooks (`preinstall`, `prebuild`, `pretest`) run `scripts/guard-devcontainer.mjs` which blocks execution outside a devcontainer. In Cursor Cloud, set `SKIP_DEVCONTAINER_GUARD=1` before `npm install`, `npm test`, or `npm run build`. The update script already handles this. For ad-hoc commands, prefix with `SKIP_DEVCONTAINER_GUARD=1`.
