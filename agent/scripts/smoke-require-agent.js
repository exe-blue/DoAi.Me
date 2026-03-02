#!/usr/bin/env node
/**
 * Agent module import smoke test — run from repo root: npm run agent:smoke
 * or from agent/: node scripts/smoke-require-agent.js
 *
 * Requires 9 core modules without invoking DB or Xiaowei. Used in CI for regression prevention.
 * Exit 0 if all load; exit 1 and print first error otherwise.
 */

const path = require("node:path");

const agentRoot = path.resolve(__dirname, "..");
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
