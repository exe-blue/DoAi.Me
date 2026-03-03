/**
 * E2E YouTube watch path (single run or watch).
 * Runs e2e-local.js; optional future: agent + Xiaowei task_devices flow.
 *
 * Usage: node tests/e2e-youtube-watch.js
 */
const { spawn } = require("child_process");
const path = require("path");

const e2eLocal = path.join(__dirname, "e2e-local.js");
const child = spawn(process.execPath, [e2eLocal], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
