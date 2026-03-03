/**
 * WF1 Bootstrap thin runner: runs an ordered sequence of async steps with module
 * delay between each step. Use from agent.js to sequence Phase 1–2 steps
 * without inlining all logic here. See agent/docs/WORKFLOW_MODULES.md.
 */
const { delayBetweenModules } = require("../lib/module-delay");

/**
 * Run a sequence of WF1 bootstrap steps with random delay between each step.
 * @param {object} config - Agent config (for moduleMinDelayMs / moduleMaxDelayMs)
 * @param {Array<() => Promise<void>>} steps - Async functions to run in order
 */
async function runBootstrapSteps(config, steps) {
  for (const step of steps) {
    await delayBetweenModules(config);
    await step();
  }
}

module.exports = { runBootstrapSteps };
