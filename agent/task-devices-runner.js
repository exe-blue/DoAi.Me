/**
 * 유일 실행 엔진: claim → steps 실행 → lease 갱신 → complete / fail_or_retry.
 * Device target: devices.connection_id ?? devices.serial_number (fallback serial).
 * Scripts: (scriptId, version) from DB, status=active 강제, op timeoutMs Promise.race.
 */
const { getLogger } = require("./common/logger");
const { runScript } = require("./script-cache");
const log = getLogger("task-devices-runner");

const POLL_INTERVAL_MS = 5000;
const LEASE_HEARTBEAT_MS = 30000;

/**
 * @param {import('./supabase-sync')} supabaseSync
 * @param {import('./xiaowei-client')} xiaowei
 * @param {object} config - { useTaskDevicesEngine, maxConcurrentDevicesPerPc, taskDeviceLeaseMinutes, taskDeviceMaxRetries }
 */
class TaskDevicesRunner {
  constructor(supabaseSync, xiaowei, config) {
    this.supabaseSync = supabaseSync;
    this.xiaowei = xiaowei;
    this.config = config;

    this._maxConcurrent = config?.maxConcurrentDevicesPerPc ?? 10;
    this._leaseMinutes = config?.taskDeviceLeaseMinutes ?? 5;
    this._maxRetries = config?.taskDeviceMaxRetries ?? 3;

    this._running = new Map();
    this._pollTimer = null;
    this._leaseTimers = new Map();
  }

  start() {
    if (this._pollTimer) return;
    const pcId = this.supabaseSync.pcId;
    if (!pcId) {
      log.warn("task_devices runner not started: no pcId");
      return;
    }
    log.info(
      "[TaskDevicesRunner] Started (slots=%s, leaseMin=%s)",
      this._maxConcurrent,
      this._leaseMinutes,
    );
    this._pollTimer = setInterval(() => this._tick(), POLL_INTERVAL_MS);
    this._tick();
  }

  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._leaseTimers.forEach((t) => clearInterval(t));
    this._leaseTimers.clear();
    this._running.clear();
    log.info("[TaskDevicesRunner] Stopped");
  }

  async _tick() {
    if (!this.xiaowei.connected) return;
    const pcId = this.supabaseSync.pcId;
    if (!pcId) return;

    const slots = Math.max(0, this._maxConcurrent - this._running.size);
    if (slots === 0) return;

    const slotsToClaim = Math.min(slots, 10);
    const claimed = await this.supabaseSync.claimTaskDevicesForPc(
      pcId,
      slotsToClaim,
    );
    for (const row of claimed) {
      if (!row?.id) continue;
      this._runOne(row, pcId);
    }
  }

  async _runOne(taskDevice, pcId) {
    const id = taskDevice.id;
    if (this._running.has(id)) return;
    this._running.set(id, { taskDevice, heartbeatTimer: null });

    const startHeartbeat = () => {
      const t = setInterval(() => {
        this.supabaseSync
          .renewTaskDeviceLease(id, pcId, this._leaseMinutes)
          .catch(() => {});
      }, LEASE_HEARTBEAT_MS);
      if (t.unref) t.unref();
      this._leaseTimers.set(id, t);
    };
    startHeartbeat();

    try {
      const target =
        await this.supabaseSync.getDeviceTargetForTaskDevice(taskDevice);
      if (!target) {
        await this.supabaseSync.failOrRetryTaskDevice(
          id,
          pcId,
          "No device target (connection_id or serial) for task_device",
          false,
        );
        this._cleanup(id);
        return;
      }

      const cfg = taskDevice.config || {};
      const snapshot = cfg.snapshot || {};
      const steps = Array.isArray(snapshot.steps) ? snapshot.steps : [];
      if (steps.length === 0) {
        await this.supabaseSync.failOrRetryTaskDevice(
          id,
          pcId,
          "task_devices.config.snapshot.steps missing or empty",
          false,
        );
        this._cleanup(id);
        return;
      }

      const ctx = {
        target,
        xiaowei: this.xiaowei,
        supabase: this.supabaseSync.supabase,
        taskDeviceId: id,
        taskDevice,
        config: cfg,
      };

      // Flatten: step.ops[] (new) or legacy flat step with step.scriptRef
      const flatOps = [];
      for (const step of steps) {
        const ops = Array.isArray(step.ops) ? step.ops : [step];
        const isStepBackground = step.background === true;
        for (const op of ops) {
          flatOps.push({ op, isBackground: isStepBackground });
        }
      }

      let backgroundPromise = Promise.resolve();
      for (const { op, isBackground } of flatOps) {
        const scriptRef = op.scriptRef || op;
        const scriptId = scriptRef.scriptId ?? scriptRef.id;
        const version = scriptRef.version;
        if (scriptId == null || scriptId === "" || version == null) {
          await this.supabaseSync.failOrRetryTaskDevice(
            id,
            pcId,
            "Step op missing scriptRef.scriptId/id or scriptRef.version",
            false,
          );
          this._cleanup(id);
          return;
        }

        const timeoutMs = op.timeoutMs ?? 180000;
        const params = op.params ?? {};
        const ref = { id: scriptId, scriptId, version };

        if (isBackground) {
          backgroundPromise = backgroundPromise.then(() =>
            this._runOneStep(ref, ctx, params, timeoutMs),
          );
        } else {
          await backgroundPromise;
          backgroundPromise = Promise.resolve();
          await this._runOneStep(ref, ctx, params, timeoutMs);
        }
      }
      await backgroundPromise;

      await this.supabaseSync.completeTaskDevice(id, pcId, {
        completed: true,
        steps: flatOps.length,
      });
      log.info("[TaskDevicesRunner] Completed task_device %s", id);
    } catch (err) {
      log.error(
        "[TaskDevicesRunner] task_device %s error: %s",
        id,
        err.message,
      );
      const retryable = err.retryable !== false;
      await this.supabaseSync.failOrRetryTaskDevice(
        id,
        pcId,
        err.message,
        retryable,
      );
    } finally {
      this._cleanup(id);
    }
  }

  /**
   * Run a single step via script-cache. Resolves on success; throws with retryable set on failure.
   * scriptRef.scriptId ?? scriptRef.id, version and timeoutMs (active/version enforced in script-cache).
   */
  async _runOneStep(scriptRef, ctx, params, timeoutMs) {
    const scriptId = scriptRef.scriptId ?? scriptRef.id;
    const out = await runScript({
      supabase: this.supabaseSync.supabase,
      scriptId,
      version: scriptRef.version,
      ctx,
      params,
      timeoutMs,
    });
    if (out.ok) return out.result;
    const err = new Error(out.error || "Script failed");
    err.retryable = out.retryable !== false;
    throw err;
  }

  _cleanup(id) {
    const t = this._leaseTimers.get(id);
    if (t) {
      clearInterval(t);
      this._leaseTimers.delete(id);
    }
    this._running.delete(id);
  }
}

module.exports = { TaskDevicesRunner };
