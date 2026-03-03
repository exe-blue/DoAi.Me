/**
 * DoAi.Me - Module boundary delay
 * Random sleep between min_delay_ms and max_delay_ms (inclusive) before/after workflow modules.
 * Config: moduleMinDelayMs, moduleMaxDelayMs (default 1500–4000). Client-configurable via settings table.
 * @see docs/WORKFLOW_MODULES.md §6
 */
const sleep = require("./sleep");

/**
 * Sleep for a random duration between config.moduleMinDelayMs and config.moduleMaxDelayMs (ms).
 * If config is missing or values invalid, uses 1500–4000. Clamps so min <= max.
 * @param {object} config - Agent config with moduleMinDelayMs, moduleMaxDelayMs
 * @returns {Promise<void>}
 */
async function delayBetweenModules(config) {
  if (!config) {
    await sleep(1500 + Math.floor(Math.random() * 2501));
    return;
  }
  let min = parseInt(config.moduleMinDelayMs, 10);
  let max = parseInt(config.moduleMaxDelayMs, 10);
  if (!Number.isFinite(min)) min = 1500;
  if (!Number.isFinite(max)) max = 4000;
  if (min > max) {
    const t = min;
    min = max;
    max = t;
  }
  const ms = min + Math.floor(Math.random() * (max - min + 1));
  await sleep(ms);
}

module.exports = { delayBetweenModules };
