# DoAi Agent (Electron)

PC Agent Electron client. Runtime config via `config.json`, logging via electron-log, auto-update via electron-updater.

## Structure (plan convention)

- `src/main/app/` — boot, lifecycle, shutdown
- `src/main/services/` — supabase, xiaowei, scheduler, config, logging, updater, task-executor
- `src/preload/bridge.ts` — IPC to renderer
- `src/renderer/` — React UI (status, settings)

## Commands

- `npm run dev` — Vite dev server + Electron
- `npm run build` — Build and package (output in `release/`)

## Config

Production: `app.getPath('userData')/config.json` (no env in build). Keys: `supabaseUrl`, `supabaseAnonKey`, `xiaoweiWsUrl`, `pcNumber`, `deviceSerials` (optional array for orchestrator), etc.

## Release (CI)

Tag push `agent-electron-v*` triggers `.github/workflows/agent-electron-release.yml`: build and publish to GitHub Releases. Set `publish: { provider: "github" }` in package.json when ready.
