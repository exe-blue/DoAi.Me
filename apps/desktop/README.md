# Desktop app (Xiaowei)

Electron app for Windows that runs the embedded Node.js agent (`src/agent`). **Windows only.** **Internal use only** — no public distribution or auto-update.

## Goals

1. **Windows only** — Runs and is built for Windows. Installer creation is supported on Windows (or Wine on Linux for unpacked output).
2. **Internal use only** — For in-house deployment. No auto-update; code signing is optional.
3. **Tests before packaging** — Before creating the installer, tests run automatically; if they fail, `dist` stops so only passing code is packaged.
4. **Simple UI for self-control** — Use the UI to restart the agent, view logs, export diagnostics, and change settings.

## Development

```bash
pnpm dev
```

Uses `src/agent/agent.js` and system `node` from the app path.

## Packaging

Run **on Windows** (or use Wine for unpacked-only output):

```bash
pnpm dist
```

1. Runs **tests** (agent smoke test). On failure, the script exits and no installer is produced.
2. Builds the app (`tsc` + `vite build`).
3. Runs `scripts/download-node-win.js` to fetch Node Windows x64 into `node-bundle/`.
4. Runs `electron-builder --win`.

The packaged app includes:

- **extraResources**: `src/agent` → `resources/agent`, `node-bundle` → `resources/node`, so the installed app can run the agent without a system Node. Sensitive env files (`.env`, `.env.*`) are excluded from the agent copy.

Full NSIS installer creation requires Windows (or Wine on Linux). The unpacked output under `release/win-unpacked` is produced on all platforms and contains `resources/agent/` and `resources/node/`.

## GitHub Release (installable exe)

To build the Windows installer in CI and publish it as a GitHub Release:

1. Ensure `pnpm install` has been run and `pnpm-lock.yaml` is committed.
2. Create and push a version tag (e.g. `v1.0.0`):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
3. The workflow [.github/workflows/release-desktop.yml](../../.github/workflows/release-desktop.yml) runs on `windows-latest`, runs `pnpm --filter @doai/desktop dist`, then creates a GitHub Release and uploads the `.exe` and `latest.yml` from `apps/desktop/release/`.
4. On the repo’s **Releases** page you’ll see the new release and can download the installable exe.

Any tag matching `v*` (e.g. `v1.0.0`, `v1.0.1`) triggers the release workflow.

## UI self-control

From the app: **Status Board** (agent status and restart), **Devices**, **Logs**, **Diagnostics** (export), and **Settings** let you control the client without external tools.
