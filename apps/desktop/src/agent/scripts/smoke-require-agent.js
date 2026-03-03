#!/usr/bin/env node
/**
 * Agent module import smoke test — run from repo root: npm run agent:smoke
 * or from agent/: node scripts/smoke-require-agent.js
 *
 * Requires 9 core modules without invoking DB or Xiaowei. Used in CI for regression prevention.
 * Exit 0 if all load; exit 1 and print first error otherwise.
 * Loads .env.local / .env from repo root and desktop so SUPABASE_* are set during dist.
 */

const path = require("node:path");
const fs = require("node:fs");

const agentRoot = path.resolve(__dirname, "..");
const desktopRoot = path.resolve(agentRoot, "..");
const repoRoot = path.resolve(desktopRoot, "..");

// Load production env so [Config] does not warn during pnpm dist
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch (_) {}
}
loadEnvFile(path.join(repoRoot, ".env.local"));
loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(desktopRoot, ".env.local"));
loadEnvFile(path.join(desktopRoot, ".env"));
loadEnvFile(path.join(agentRoot, ".env"));
const modules = [
  "config",
  "lib/logger",
  "lib/sleep",
  "orchestrator/models",
  "scheduling/queue-dispatcher",
  "scheduling/schedule-evaluator",
  "core/supabase-sync",
  "device/heartbeat",
  "task/task-executor",
];

let failed = false;
for (const name of modules) {
  try {
    require(path.join(agentRoot, name));
    console.log(`[smoke] OK ${name}`);
  } catch (err) {
    console.error(`[smoke] FAIL ${name}: ${err.message}`);
    failed = true;
    break;
  }
}

process.exit(failed ? 1 : 0);
