/**
 * Task-devices SSOT runner: claim task_devices rows, run workflow steps, complete/fail with retry.
 * Concurrency: 10 per PC. One running per device. Retry up to 3 times.
 *
 * yt_* / adb_* steps run via youtube-runner-adapter (ADBDevice from Xiaowei + deviceTarget).
 * Legacy watch/watch_video fallback: watchAdapter or _defaultWatch.
 */
const { getLogger } = require("./common/logger");
const { runYoutubeStep } = require("./youtube-runner-adapter");
const log = getLogger("task-devices-runner");

const POLL_INTERVAL_MS = 5000;
const LEASE_HEARTBEAT_MS = 30000; // 30s lease renewal

const DEFAULT_STEPS = [
  { module: "yt_preflight", waitSecAfter: 1, params: {} },
  { module: "yt_search_video", waitSecAfter: 2, params: { mode: "title" } },
  {
    module: "yt_watch_video",
    waitSecAfter: 1,
    params: { minWatchSec: 240, maxWatchSec: 420 },
  },
  {
    module: "yt_actions",
    waitSecAfter: 0,
    params: { like: true, comment: true, scrap: true },
  },
];

class TaskDevicesRunner {
  /**
   * @param {import('./supabase-sync')} supabaseSync
   * @param {import('./xiaowei-client')} xiaowei
   * @param {object} config - { useTaskDevicesEngine, maxConcurrentTasks, pcNumber }
   * @param {object} [opts] - { watchAdapter: (deviceTarget, config) => Promise<void> }
   */
  constructor(supabaseSync, xiaowei, config, opts = {}) {
    this.supabaseSync = supabaseSync;
    this.xiaowei = xiaowei;
    this.config = config;
    this.watchAdapter = opts.watchAdapter || null;

    this._maxConcurrent = (config && config.maxConcurrentDevicesPerPc) ?? 10;
    this._leaseMinutes = (config && config.taskDeviceLeaseMinutes) ?? 5;
    this._maxRetries = (config && config.taskDeviceMaxRetries) ?? 3;

    this._running = new Map(); // task_device_id -> { taskDevice, heartbeatTimer }
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
      "[TaskDevicesRunner] Started (maxConcurrent=%s, leaseMin=%s)",
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

    const slots = this._maxConcurrent - this._running.size;
    if (slots <= 0) return;

    const claimed = await this.supabaseSync.claimTaskDevicesForPc(pcId, slots);
    for (const row of claimed) {
      if (!row || !row.id) continue;
      this._runOne(row, pcId);
    }
  }

  async _runOne(taskDevice, pcId) {
    const id = taskDevice.id;
    if (this._running.has(id)) return;
    this._running.set(id, { taskDevice, heartbeatTimer: null });

    const startHeartbeat = () => {
      const t = setInterval(async () => {
        await this.supabaseSync.renewTaskDeviceLease(
          id,
          pcId,
          this._leaseMinutes,
        );
      }, LEASE_HEARTBEAT_MS);
      if (t.unref) t.unref();
      this._leaseTimers.set(id, t);
    };
    startHeartbeat();

    try {
      const deviceTarget =
        await this.supabaseSync.getDeviceTargetForTaskDevice(taskDevice);
      if (!deviceTarget) {
        await this.supabaseSync.failOrRetryTaskDevice(
          id,
          pcId,
          "No device_target for task_device",
          false,
        );
        this._cleanup(id);
        return;
      }

      const cfg = taskDevice.config || {};
      const steps =
        cfg.workflow?.steps ||
        (Array.isArray(cfg.steps) ? cfg.steps : DEFAULT_STEPS);

      for (const step of steps) {
        const module = step.module || "yt_watch_video";
        const waitSec = step.waitSecAfter ?? 60;
        const isYtOrAdb =
          module === "yt_preflight" ||
          module === "yt_search_video" ||
          module === "yt_watch_video" ||
          module === "yt_actions" ||
          module === "adb_restart" ||
          module === "adb_optimize";
        const isLegacyWatch =
          module === "watch" ||
          module === "watch_video" ||
          module === "search_video" ||
          module === "video_actions";

        if (isYtOrAdb) {
          await runYoutubeStep(deviceTarget, this.xiaowei, step, cfg);
          await _sleep(Math.min(waitSec, 300) * 1000);
        } else if (isLegacyWatch) {
          if (this.watchAdapter) {
            await this.watchAdapter(deviceTarget, { ...cfg, _step: step });
          } else {
            await this._defaultWatch(deviceTarget, cfg);
          }
          await _sleep(Math.min(waitSec, 300) * 1000);
        }
      }

      await this.supabaseSync.completeTaskDevice(id, pcId, {
        completed: true,
        steps: steps.length,
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

  async _defaultWatch(deviceTarget, config) {
    const videoUrl =
      config.video_url ||
      (config.video_id &&
        `https://www.youtube.com/watch?v=${config.video_id}`) ||
      null;
    if (!videoUrl) return;
    const durationSec = Math.min(Number(config.duration_sec) || 60, 300);
    try {
      await this.xiaowei.actionCreate(deviceTarget, "YouTube_시청", {
        count: 1,
        taskInterval: [1000, 3000],
        deviceInterval: "500",
      });
    } catch (e) {
      await this.xiaowei.adbShell(
        deviceTarget,
        `am start -a android.intent.action.VIEW -d "${videoUrl}"`,
      );
    }
    await _sleep(durationSec * 1000);
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

function _sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = { TaskDevicesRunner, DEFAULT_STEPS };
