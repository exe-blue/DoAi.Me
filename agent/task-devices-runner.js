/**
 * 유일 실행 엔진: claim → steps 실행 → lease 갱신 → complete / fail_or_retry.
 * Device target: devices.connection_id ?? devices.serial_number (fallback serial).
 * Scripts: (scriptId, version) from DB, status=active 강제, op timeoutMs Promise.race.
 * YouTube: config.inputs.keyword/video_url 있으면 agent/youtube executeYouTubeMission으로 검색·시청·액션 실행.
 */
const { getLogger } = require("./common/logger");
const { runScript } = require("./script-cache");
const { createDev } = require("./youtube-runner-adapter");
const { executeYouTubeMission } = require("./youtube/flows");
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
      const inputs = cfg.inputs || {};
      const payload = cfg.payload || {};

      // YouTube mission: config.inputs.keyword 또는 video_url 있으면 agent/youtube로 검색·시청·액션 실행
      if (this._isYoutubeMissionConfig(cfg)) {
        await this._runYoutubeMission(target, cfg, id, pcId);
        return;
      }

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
   * config에 inputs.keyword 또는 inputs.video_url 이 있으면 agent/youtube 미션으로 실행.
   */
  _isYoutubeMissionConfig(cfg) {
    const inputs = cfg.inputs || {};
    return (
      (typeof inputs.keyword === "string" && inputs.keyword.length > 0) ||
      (typeof inputs.video_url === "string" && inputs.video_url.length > 0) ||
      (typeof inputs.videoId === "string" && inputs.videoId.length > 0)
    );
  }

  /**
   * agent/youtube executeYouTubeMission 실행 후 complete 또는 fail_or_retry.
   */
  async _runYoutubeMission(target, cfg, taskDeviceId, pcId) {
    const inputs = cfg.inputs || {};
    const payload = cfg.payload || {};
    const keyword =
      inputs.keyword ||
      inputs.videoId ||
      (inputs.video_url && inputs.video_url.includes("v=")
        ? inputs.video_url.split("v=")[1].split("&")[0]
        : null) ||
      "youtube";
    const watchPercent = Math.min(100, Math.max(0, Number(payload.watchPercent) ?? 80));
    const baseDuration = 120;
    const watchDuration = Math.round((watchPercent / 100) * baseDuration) || 60;
    const actions = [];
    if (Number(payload.likeProb) > 0) actions.push("like");
    if (Number(payload.commentProb) > 0) actions.push("comment");
    if (payload.subscribeToggle) actions.push("subscribe");
    if (Number(payload.saveProb) > 0) actions.push("save");

    const mission = {
      type: "watch_and_engage",
      videoId: inputs.videoId || null,
      keyword,
      watchDuration,
      actions,
      probLike: Number(payload.likeProb) ?? 15,
      probComment: Number(payload.commentProb) ?? 5,
      probSubscribe: payload.subscribeToggle ? 100 : 0,
      probSave: Number(payload.saveProb) ?? 3,
    };

    try {
      const dev = createDev(this.xiaowei, target);
      const result = await executeYouTubeMission(dev, mission, {});
      if (result.success) {
        await this.supabaseSync.completeTaskDevice(taskDeviceId, pcId, {
          completed: true,
          watchedSec: result.watchedSec,
          watchPct: result.watchPct,
          actions: result.actions,
          videoInfo: result.videoInfo,
        });
        log.info(
          "[TaskDevicesRunner] YouTube mission completed task_device %s (watched=%ss)",
          taskDeviceId,
          result.watchedSec,
        );
      } else {
        await this.supabaseSync.failOrRetryTaskDevice(
          taskDeviceId,
          pcId,
          result.abortReason || result.errors?.join("; ") || "YouTube mission failed",
          true,
        );
      }
    } catch (err) {
      log.error("[TaskDevicesRunner] YouTube mission error task_device %s: %s", taskDeviceId, err.message);
      await this.supabaseSync.failOrRetryTaskDevice(
        taskDeviceId,
        pcId,
        err.message,
        err.retryable !== false,
      );
    } finally {
      this._cleanup(taskDeviceId);
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
