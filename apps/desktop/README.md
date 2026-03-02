# Desktop app (Xiaowei)

Electron app for Windows that runs the embedded Node.js agent (`src/agent`). **Windows only.** **Internal use only** — auto-update works when a GitHub Release exists (see Packaging / GitHub Release).

## Goals

1. **Windows only** — Runs and is built for Windows. Installer creation is supported on Windows (or Wine on Linux for unpacked output).
2. **Internal use only** — For in-house deployment. Auto-update works when a GitHub Release exists (see below).
3. **Tests before packaging** — Before creating the installer, tests run automatically; if they fail, `dist` stops so only passing code is packaged.
4. **Simple UI for self-control** — Use the UI to restart the agent, view logs, export diagnostics, and change settings.

## Development

```bash
pnpm dev
```

Uses `src/agent/agent.js` and system `node` from the app path.

## Packaging

- **Version:** Each run of `pnpm dist` bumps the **patch** version in `package.json` (e.g. 1.0.1 → 1.0.2) so every build has a unique version.
- For **GitHub Release** builds (CI), the version is set from the git tag (e.g. tag `v1.0.2` → app version `1.0.2`).

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
3. The workflow [.github/workflows/release-desktop.yml](../../.github/workflows/release-desktop.yml) runs on `windows-latest`, sets the app version from the tag, builds the desktop app, runs `electron-builder --win`, then creates a GitHub Release and uploads the `.exe` and `latest.yml` from `apps/desktop/release/`.
4. On the repo’s **Releases** page you’ll see the new release and can download the installable exe.

Any tag matching `v*` (e.g. `v1.0.0`, `v1.0.1`) triggers the release workflow. The workflow sets `apps/desktop` version from the tag so the built installer and `latest.yml` match the release.

### Why “Check for updates” might say no update

- There must be a **GitHub Release** with a **tag** like `v1.0.2` and **version inside the app** lower than that (e.g. installed app `1.0.1`).
- The release must include **`latest.yml`** and the **`.exe`** installer (the workflow uploads these).
- If the repo is **private**, the installed app cannot see releases unless it has a token (not implemented); use a public repo or manual installs.

## UI self-control

From the app: **Status Board** (agent status and restart), **Devices**, **Logs**, **Diagnostics** (export), and **Settings** let you control the client without external tools.
