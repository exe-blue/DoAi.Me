/**
 * @doai/shared — task constants (pure JS).
 * 타임아웃: step 30분, task 20분 등.
 */

/** Step timeout in seconds (default 30 min) */
const STEP_TIMEOUT_SEC = 30 * 60;

/** Task timeout in seconds (default 20 min) */
const TASK_TIMEOUT_SEC = 20 * 60;

module.exports = {
  STEP_TIMEOUT_SEC,
  TASK_TIMEOUT_SEC,
};
