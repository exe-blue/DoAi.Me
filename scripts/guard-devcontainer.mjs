// scripts/guard-devcontainer.mjs
/**
 * Enforce Dev Container-only execution.
 * Fails fast when running outside a dev container / codespace.
 *
 * Why:
 * - Prevent WSL/Windows/Container mixing that causes huge diffs, EOL issues,
 *   "rollback-looking" behavior, and inconsistent builds.
 */

import fs from "node:fs";
import path from "node:path";

function fileExists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function isDevContainer() {
  // Common devcontainer/codespaces signals
  const env = process.env;
  // 파일 상단에 추가
  if (process.env.VERCEL || process.env.CI) {
    process.exit(0); // Vercel/CI 환경이면 통과
  }
  // VS Code Dev Containers / Codespaces
  if (env.REMOTE_CONTAINERS === "true") return true;
  if (env.CODESPACES === "true") return true;
  if (env.CODESPACE_NAME) return true;

  // Many devcontainers mount workspace here
  const cwd = process.cwd().replace(/\\/g, "/");
  if (cwd.startsWith("/workspaces/")) return true;

  // Docker / container signals
  if (fileExists("/.dockerenv")) return true;
  if (fileExists("/run/.containerenv")) return true;

  // Devcontainer marker (often present)
  if (fileExists("/.devcontainer") || fileExists("/devcontainer.json"))
    return true;

  // Heuristic: if running in linux container but not /workspaces, still might be container,
  // but we keep it strict to avoid false positives.
  return false;
}

function main() {
  // Allow explicit override only if you later decide to support it.
  // For now, strict mode: no override.
  const ok = isDevContainer();

  if (!ok) {
    const cwd = process.cwd();
    const hint = [
      "",
      "✖ Dev Container required",
      "",
      `Current working dir: ${cwd}`,
      "",
      "This repository enforces Dev Container-only execution for npm commands.",
      "Open the repo in a Dev Container (VS Code / Cursor: 'Reopen in Container')",
      "and re-run the command inside the container terminal.",
      "",
    ].join("\n");

    // Print to stderr and fail
    process.stderr.write(hint);
    process.exit(1);
  }
}

main();
