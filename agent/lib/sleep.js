/**
 * Single shared sleep utility for the agent (Rule H).
 * Use this everywhere instead of local _sleep/setTimeout for delays.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = sleep;
