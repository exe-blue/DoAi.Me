/**
 * @doai/shared — device constants (pure JS).
 * 동시실행 20대, 시청비율 등.
 */

/** Max concurrent devices per PC */
const MAX_CONCURRENT_DEVICES = 20;

/** Default watch percentage range (min, max) 0–100 */
const DEFAULT_WATCH_MIN_PCT = 50;
const DEFAULT_WATCH_MAX_PCT = 100;

module.exports = {
  MAX_CONCURRENT_DEVICES,
  DEFAULT_WATCH_MIN_PCT,
  DEFAULT_WATCH_MAX_PCT,
};
