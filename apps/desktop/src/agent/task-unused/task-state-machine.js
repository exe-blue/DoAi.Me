/**
 * DoAi.Me - Task State Machine
 * Explicit state machine for task lifecycle management
 *
 * States: IDLE → QUEUED → RUNNING → COMPLETED / FAILED → RETRY_PENDING → DEAD_LETTER
 */
const { EventEmitter } = require("events");

const STATES = Object.freeze({
  IDLE: "IDLE",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  RETRY_PENDING: "RETRY_PENDING",
  DEAD_LETTER: "DEAD_LETTER",
});

/** Valid transitions: from state → allowed next states */
const TRANSITIONS = Object.freeze({
  [STATES.IDLE]: [STATES.QUEUED],
  [STATES.QUEUED]: [STATES.RUNNING, STATES.FAILED],
  [STATES.RUNNING]: [STATES.COMPLETED, STATES.FAILED],
  [STATES.COMPLETED]: [STATES.IDLE],
  [STATES.FAILED]: [STATES.RETRY_PENDING, STATES.DEAD_LETTER, STATES.IDLE],
  [STATES.RETRY_PENDING]: [STATES.RUNNING, STATES.DEAD_LETTER],
  [STATES.DEAD_LETTER]: [],
});

const MAX_HISTORY = 100;

class TaskStateMachine extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} [opts.maxRetries=3] - Max retry attempts before DEAD_LETTER
   * @param {number} [opts.retryDelayMs=5000] - Delay before retrying
   * @param {string} [opts.taskId] - Optional task identifier for logging
   */
  constructor(opts = {}) {
    super();
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 5000;
    this.taskId = opts.taskId || null;

    this.state = STATES.IDLE;
    this.retryCount = 0;
    this.history = [];
    this._retryTimer = null;

    this._record(STATES.IDLE, "init");
  }

  /** Current state string */
  get current() {
    return this.state;
  }

  /** Attempt a transition to `next`; throws if not allowed */
  transition(next, reason = "") {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(
        `[TaskSM] Invalid transition: ${this.state} → ${next}` +
          (this.taskId ? ` (task ${this.taskId})` : "")
      );
    }
    const prev = this.state;
    this.state = next;
    this._record(next, reason);
    this.emit("transition", { prev, next, reason, taskId: this.taskId });
    return this;
  }

  /** Enqueue the task (IDLE → QUEUED) */
  enqueue(reason = "enqueued") {
    return this.transition(STATES.QUEUED, reason);
  }

  /** Start execution (QUEUED → RUNNING) */
  start(reason = "started") {
    return this.transition(STATES.RUNNING, reason);
  }

  /** Mark completed (RUNNING → COMPLETED) */
  complete(reason = "completed") {
    return this.transition(STATES.COMPLETED, reason);
  }

  /**
   * Handle failure — auto-routes to RETRY_PENDING or DEAD_LETTER
   * based on retryCount vs maxRetries.
   * @param {string} [reason]
   */
  fail(reason = "failed") {
    this.transition(STATES.FAILED, reason);
    this.retryCount += 1;

    if (this.retryCount <= this.maxRetries) {
      this.transition(STATES.RETRY_PENDING, `retry ${this.retryCount}/${this.maxRetries}`);
      this.emit("retry_pending", {
        retryCount: this.retryCount,
        maxRetries: this.maxRetries,
        taskId: this.taskId,
      });
    } else {
      this.transition(STATES.DEAD_LETTER, `max retries (${this.maxRetries}) exceeded`);
      this.emit("dead_letter", { retryCount: this.retryCount, taskId: this.taskId });
    }
    return this;
  }

  /**
   * Schedule a retry: wait retryDelayMs, then transition RETRY_PENDING → RUNNING
   * and invoke the callback.
   * @param {function} cb - Async function to execute on retry
   */
  scheduleRetry(cb) {
    if (this.state !== STATES.RETRY_PENDING) {
      throw new Error(`[TaskSM] scheduleRetry called in non-RETRY_PENDING state: ${this.state}`);
    }
    this._retryTimer = setTimeout(async () => {
      this._retryTimer = null;
      try {
        this.transition(STATES.RUNNING, "retry executing");
        await cb();
      } catch (err) {
        // Let caller handle further failures via fail()
        this.emit("retry_error", { err, taskId: this.taskId });
      }
    }, this.retryDelayMs);
    return this;
  }

  /**
   * Force reset to IDLE from any state (operator override).
   * Cancels any pending retry timer.
   */
  reset(reason = "operator reset") {
    if (this._retryTimer) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    const prev = this.state;
    this.state = STATES.IDLE;
    this.retryCount = 0;
    this._record(STATES.IDLE, reason);
    this.emit("reset", { prev, reason, taskId: this.taskId });
    return this;
  }

  /** Snapshot of transition history (capped at MAX_HISTORY) */
  getHistory() {
    return [...this.history];
  }

  _record(state, reason) {
    this.history.push({ state, reason, ts: Date.now() });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }
}

TaskStateMachine.STATES = STATES;
TaskStateMachine.TRANSITIONS = TRANSITIONS;

module.exports = TaskStateMachine;
