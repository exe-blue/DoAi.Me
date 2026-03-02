/**
 * DoAi.Me - Device Orchestrator
 * SSOT: public.task_devices. Execution path only: claim_task_devices_for_pc / claim_next_task_device → runTaskDevice (Rule 1).
 */
const presets = require("./device-presets");
const { takeScreenshotOnComplete } = require("./screenshot-on-complete");
const sleep = require("../lib/sleep");
const logger = require("../lib/logger");

const STATUS = {
  idle: "idle",
  free_watch: "free_watch",
  searching: "searching",
  watching: "watching",
  completing: "completing",
  error: "error",
  quarantined: "quarantined",
};

const SAME_JOB_MAX_DEVICES = 5;
const ORCHESTRATE_INTERVAL_MS = 3000;
const WATCH_TIMEOUT_MS = 30 * 60 * 1000; // 30 min

class DeviceOrchestrator {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {import('./task-executor')} taskExecutor
   * @param {object} config - { pcId (name string), pcUuid (UUID), maxConcurrent? }
   */
  constructor(xiaowei, supabase, taskExecutor, config) {
    this.xiaowei = xiaowei;
    this.supabase = supabase;
    this.taskExecutor = taskExecutor;
    this.pcId = config.pcId;
    this.pcUuid = config.pcUuid || null;
    this.maxConcurrent = config.maxConcurrent ?? 10;
    this.loggingDir = config.loggingDir || null;

    /** @type {Map<string, DeviceState>} serial -> state */
    this.deviceStates = new Map();
    /** @type {Map<string, string>} devices.id (UUID) -> ADB serial */
    this._deviceIdToSerial = new Map();
    this._pollTimer = null;
    this._runningAssignments = new Set(); // assignment id
  }

  start() {
    if (this._pollTimer) return;
    console.log(`[DeviceOrchestrator] Starting pcId=${this.pcId} (every ${ORCHESTRATE_INTERVAL_MS / 1000}s, maxConcurrent=${this.maxConcurrent})`);
    this._pollTimer = setInterval(() => this._orchestrate().catch((e) => console.error("[DeviceOrchestrator]", e)), ORCHESTRATE_INTERVAL_MS);
  }

  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    console.log("[DeviceOrchestrator] Stopped");
  }

  /**
   * 3초마다: 디바이스 목록 갱신, idle → 배정, free_watch → 대기열 있으면 중단, watching → 타임아웃, error → 복구
   */
  async _orchestrate() {
    if (!this.xiaowei.connected) return;
    let devices = [];
    try {
      const res = await this.xiaowei.list();
      if (Array.isArray(res)) {
        devices = res.map((d) => d.serial || d.id || d.deviceId).filter(Boolean);
      } else if (res && typeof res === "object") {
        const data = res.data || res.devices || res.list;
        if (Array.isArray(data)) {
          devices = data.map((d) => d.serial || d.id || d.deviceId).filter(Boolean);
        } else {
          devices = Object.keys(res).filter((k) => !["action", "status", "code", "msg"].includes(k));
        }
      }
    } catch (err) {
      console.error("[DeviceOrchestrator] list error:", err.message);
      return;
    }

    for (const serial of devices) {
      this._ensureDeviceState(serial);
      const state = this.deviceStates.get(serial);
      if (state.status === STATUS.idle) {
        await this._assignWork(serial);
        continue;
      }
      if (state.status === STATUS.free_watch) {
        const hasPending = await this._hasPendingAssignment();
        if (hasPending) {
          state.status = STATUS.idle;
          console.log(`[DeviceOrchestrator] ${serial.substring(0, 6)} free_watch → idle (pending work)`);
        }
        continue;
      }
      if (state.status === STATUS.watching && state.startedAt) {
        const elapsed = Date.now() - state.startedAt;
        if (elapsed > WATCH_TIMEOUT_MS) {
          console.warn(`[DeviceOrchestrator] ${serial.substring(0, 6)} watch timeout (${Math.round(elapsed / 60000)}m)`);
          this._setState(serial, STATUS.error, { errorCount: (state.errorCount || 0) + 1 });
        }
        continue;
      }
      if (state.status === STATUS.error) {
        await this._tryRecoverError(serial);
        continue;
      }
    }
  }

  _ensureDeviceState(serial) {
    if (!this.deviceStates.has(serial)) {
      this.deviceStates.set(serial, {
        status: STATUS.idle,
        assignmentId: null,
        videoTitle: null,
        startedAt: null,
        watchProgress: 0,
        errorCount: 0,
        dailyWatchCount: 0,
        dailyWatchSeconds: 0,
        lastTaskAt: null,
      });
    }
  }

  _setState(serial, status, extra = {}) {
    const s = this.deviceStates.get(serial) || {};
    Object.assign(s, { status, ...extra });
    this.deviceStates.set(serial, s);
  }

  /**
   * 동시 실행 수 체크 → task_device claim → 있으면 실행, 없으면 free_watch 여부
   */
  async _assignWork(serial) {
    const running = this._runningAssignments.size;
    if (running >= this.maxConcurrent) return;

    if (process.env.DEBUG_ORCHESTRATOR || process.env.DEBUG_ORCHESTRATOR_CLAIM) {
      console.log(`[DeviceOrchestrator] _assignWork(${serial.substring(0, 6)}) pcId=${this.pcId}`);
    }
    const taskDevice = await this._claimNextTaskDevice(serial);
    if (process.env.DEBUG_ORCHESTRATOR || process.env.DEBUG_ORCHESTRATOR_CLAIM) {
      console.log(`[DeviceOrchestrator] claim result: ${taskDevice ? taskDevice.id.substring(0, 8) : "null"}`);
    }
    if (taskDevice) {
      const targetSerial = taskDevice.device_serial || serial;
      // Rule A: actual execution device must match task_devices.device_id / device_serial
      const expectedSerialForDeviceId = taskDevice.device_id ? this._deviceIdToSerial.get(taskDevice.device_id) : null;
      if (expectedSerialForDeviceId != null && expectedSerialForDeviceId !== targetSerial) {
        logger.warn("DeviceOrchestrator", `device_id/serial mismatch: task_device expects ${expectedSerialForDeviceId}, got ${targetSerial} — releasing`, {
          pc_id: this.pcId,
          device_serial: targetSerial,
          task_device_id: taskDevice.id,
          task_id: taskDevice.task_id,
        });
        await this._releaseTaskDevice(taskDevice.id);
        return;
      }
      if (taskDevice.device_serial != null && taskDevice.device_serial !== targetSerial) {
        logger.warn("DeviceOrchestrator", `device_serial mismatch: task_device.device_serial=${taskDevice.device_serial}, execution serial=${targetSerial} — releasing`, {
          pc_id: this.pcId,
          task_device_id: taskDevice.id,
        });
        await this._releaseTaskDevice(taskDevice.id);
        return;
      }
      console.log(`[DeviceOrchestrator] ${targetSerial.substring(0, 6)} → taskDevice ${taskDevice.id.substring(0, 8)}`);
      const sameTaskCount = await this._countDevicesOnTask(taskDevice.task_id);
      if (sameTaskCount > SAME_JOB_MAX_DEVICES) {
        await this._releaseTaskDevice(taskDevice.id);
        return;
      }
      this._setState(targetSerial, STATUS.searching, { assignmentId: taskDevice.id, videoTitle: (taskDevice.config?.video_id || null) });
      this._executeTargetWatch(targetSerial, taskDevice).catch((err) => {
        console.error(`[DeviceOrchestrator] ${targetSerial.substring(0, 6)} target watch error:`, err.message);
        this._runningAssignments.delete(taskDevice.id);
        this._setState(targetSerial, STATUS.error, { errorCount: (this.deviceStates.get(targetSerial)?.errorCount || 0) + 1 });
      });
      return;
    }

    const hasPending = await this._hasPendingAssignment();
    if (!hasPending) {
      this._setState(serial, STATUS.free_watch);
      this._executeFreeWatch(serial).catch((err) => {
        console.error(`[DeviceOrchestrator] ${serial.substring(0, 6)} free watch error:`, err.message);
        this._setState(serial, STATUS.idle);
      });
    }
  }

  /**
   * Detect function-not-found / signature mismatch RPC errors for fallback.
   * Handles PostgREST function cache misses and PostgreSQL undefined function cases.
   */
  _isMissingRpcOrSignatureError(error, rpcName) {
    if (!error) return false;
    const code = String(error.code || "").toUpperCase();
    if (code === "PGRST202" || code === "42883") return true;
    const message = String(error.message || "").toLowerCase();
    const rpc = String(rpcName || "").toLowerCase();
    return (
      message.includes(rpc) && (
        message.includes("could not find the function") ||
        message.includes("does not exist") ||
        message.includes("no function matches the given name and argument types")
      )
    );
  }

  /**
   * Claim 1 task_device with backward-compatible RPC fallbacks:
   * 1) claim_task_devices_for_pc(runner_pc_name, max_to_claim) - latest
   * 2) claim_task_devices_for_pc(runner_pc_id, max_to_claim)   - UUID variant
   * 3) claim_next_task_device(p_worker_id, p_device_serial)    - legacy
   * Resolves device_serial from _deviceIdToSerial map when only device_id is returned.
   */
  async _claimNextTaskDevice(serial) {
    try {
      const attempts = [
        {
          rpc: "claim_task_devices_for_pc",
          params: { runner_pc_name: this.pcId, max_to_claim: 1 },
        },
        this.pcUuid
          ? {
            rpc: "claim_task_devices_for_pc",
            params: { runner_pc_id: this.pcUuid, max_to_claim: 1 },
          }
          : null,
        this.pcUuid
          ? {
            rpc: "claim_next_task_device",
            params: { p_worker_id: this.pcUuid, p_device_serial: serial },
          }
          : null,
      ].filter(Boolean);

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        const { data, error } = await this.supabase.rpc(attempt.rpc, attempt.params);
        if (!error) {
          const row = Array.isArray(data) ? data[0] : (data && data.id ? data : null);
          if (!row) return null;
          if (!row.device_serial && row.device_id) {
            row.device_serial = this._deviceIdToSerial.get(row.device_id) || null;
          }
          return row;
        }

        const hasFallback = i < attempts.length - 1;
        const canFallback = this._isMissingRpcOrSignatureError(error, attempt.rpc);
        if (hasFallback && canFallback) {
          if (process.env.DEBUG_ORCHESTRATOR || process.env.DEBUG_ORCHESTRATOR_CLAIM) {
            console.warn(
              `[DeviceOrchestrator] ${attempt.rpc} signature mismatch -> fallback`,
            );
          }
          continue;
        }

        console.warn(`[DeviceOrchestrator] ${attempt.rpc} error:`, error.message);
        return null;
      }

      return null;
    } catch (err) {
      logger.warn("DeviceOrchestrator", `_claimNextTaskDevice: ${err.message}`, { pc_id: this.pcId });
      return null;
    }
  }

  /**
   * Update the device UUID → serial mapping from batchUpsertDevices results.
   * Called by heartbeat after each device sync.
   * @param {Array<{id: string, serial: string}>} rows
   */
  updateDeviceIdMap(rows) {
    for (const row of rows) {
      if (row.id && (row.serial_number ?? row.serial)) {
        this._deviceIdToSerial.set(row.id, row.serial_number ?? row.serial);
      }
    }
  }

  async _hasPendingAssignment() {
    try {
      const { count, error } = await this.supabase
        .from("task_devices")
        .select("id", { count: "exact", head: true })
        .eq("pc_id", this.pcUuid)
        .eq("status", "pending");
      if (error) {
        logger.warn("DeviceOrchestrator", `_hasPendingAssignment query error: ${error.message}`, { pc_id: this.pcId });
        return false;
      }
      if ((count || 0) > 0) return true;
      const { count: c2, error: e2 } = await this.supabase
        .from("task_devices")
        .select("id", { count: "exact", head: true })
        .is("pc_id", null)
        .eq("status", "pending");
      if (e2) {
        logger.warn("DeviceOrchestrator", `_hasPendingAssignment unassigned query error: ${e2.message}`, { pc_id: this.pcId });
        return false;
      }
      return (c2 || 0) > 0;
    } catch (err) {
      logger.warn("DeviceOrchestrator", `_hasPendingAssignment exception: ${err.message}`, { pc_id: this.pcId });
      return false;
    }
  }

  async _countDevicesOnTask(taskId) {
    try {
      const { count, error } = await this.supabase
        .from("task_devices")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId)
        .in("status", ["pending", "running"]);
      if (error) {
        logger.warn("DeviceOrchestrator", `_countDevicesOnTask error: ${error.message}`, { pc_id: this.pcId, task_id: taskId });
        return 0;
      }
      return count || 0;
    } catch (err) {
      logger.warn("DeviceOrchestrator", `_countDevicesOnTask exception: ${err.message}`, { pc_id: this.pcId, task_id: taskId });
      return 0;
    }
  }

  async _releaseTaskDevice(taskDeviceId) {
    try {
      await this.supabase
        .from("task_devices")
        .update({ status: "pending", started_at: null })
        .eq("id", taskDeviceId);
    } catch (err) {
      console.warn("[DeviceOrchestrator] _releaseTaskDevice:", err.message);
    }
  }

  /**
   * device-presets warmup → 완료 후 idle
   */
  async _executeFreeWatch(serial) {
    const state = this.deviceStates.get(serial);
    if (state?.status !== STATUS.free_watch) return;
    try {
      await presets.warmup(this.xiaowei, serial, { durationSec: 120 });
      this._setState(serial, STATUS.idle);
      const s = this.deviceStates.get(serial);
      if (s) {
        s.dailyWatchCount = (s.dailyWatchCount || 0) + 1;
        s.dailyWatchSeconds = (s.dailyWatchSeconds || 0) + 120;
        s.lastTaskAt = new Date().toISOString();
      }
    } catch (err) {
      this._setState(serial, STATUS.idle);
      throw err;
    }
  }

  /**
   * TaskExecutor로 검색+시청 실행. searching → watching → completing → idle / error
   */
  async _executeTargetWatch(serial, taskDevice) {
    this._runningAssignments.add(taskDevice.id);
    const state = this.deviceStates.get(serial);
    state.status = STATUS.watching;
    state.startedAt = Date.now();
    state.videoTitle = (taskDevice.config?.video_id || null);

    const row = { ...taskDevice };
    if (!row.device_serial) row.device_serial = serial;

    try {
      await this.taskExecutor.runTaskDevice(row);
      const nextDailyCount = (state.dailyWatchCount || 0) + 1;
      if (this.loggingDir) {
        takeScreenshotOnComplete(this.xiaowei, serial, nextDailyCount, this.loggingDir).catch(() => {});
      }
      const { data: completeData } = await this.supabase.rpc("complete_task_device", {
        p_task_device_id: taskDevice.id,
      });
      if (completeData == null) {
        console.log("[DeviceOrchestrator] complete_task_device 0 rows (already terminated e.g. timeout)");
      }
    } catch (execErr) {
      const { data: failData } = await this.supabase.rpc("fail_or_retry_task_device", {
        p_task_device_id: taskDevice.id,
        p_error: execErr.message,
      }).catch(() => ({ data: null }));
      if (failData == null) {
        console.log("[DeviceOrchestrator] fail_or_retry_task_device 0 rows (already terminated)");
      }
      throw execErr;
    } finally {
      this._runningAssignments.delete(taskDevice.id);
    }

    const s = this.deviceStates.get(serial);
    s.status = STATUS.completing;
    s.watchProgress = 100;
    s.dailyWatchCount = (s.dailyWatchCount || 0) + 1;
    s.dailyWatchSeconds = (s.dailyWatchSeconds || 0) + 60;
    s.lastTaskAt = new Date().toISOString();
    s.assignmentId = null;
    s.videoTitle = null;
    s.startedAt = null;
    s.errorCount = 0;
    s.status = STATUS.idle;
  }

  /**
   * error 상태 복구: YouTube 재시작 후 idle
   */
  async _tryRecoverError(serial) {
    const state = this.deviceStates.get(serial);
    if (state.status !== STATUS.error) return;
    try {
      await this.xiaowei.adbShell(serial, "am force-stop com.google.android.youtube");
      await sleep(1000);
      this._setState(serial, STATUS.idle, { errorCount: 0 });
      console.log(`[DeviceOrchestrator] ${serial.substring(0, 6)} recovered from error → idle`);
    } catch (err) {
      console.warn(`[DeviceOrchestrator] ${serial.substring(0, 6)} recover failed:`, err.message);
    }
  }

  getStatus() {
    const states = {};
    for (const [serial, s] of this.deviceStates) {
      states[serial] = {
        status: s.status,
        assignmentId: s.assignmentId,
        videoTitle: s.videoTitle,
        watchProgress: s.watchProgress ?? 0,
        errorCount: s.errorCount ?? 0,
        dailyWatchCount: s.dailyWatchCount ?? 0,
        dailyWatchSeconds: s.dailyWatchSeconds ?? 0,
      };
    }
    return {
      pcId: this.pcId,
      maxConcurrent: this.maxConcurrent,
      runningCount: this._runningAssignments.size,
      deviceStates: states,
    };
  }

  /**
   * Heartbeat에서 호출. devices 테이블 동기화용 { serial -> task_status, current_assignment_id, ... }
   */
  getDeviceStatesForSync() {
    const out = {};
    for (const [serial, s] of this.deviceStates) {
      out[serial] = {
        task_status: s.status,
        current_assignment_id: s.assignmentId || null,
        current_video_title: s.videoTitle || null,
        watch_progress: s.watchProgress ?? 0,
        consecutive_errors: s.errorCount ?? 0,
        daily_watch_count: s.dailyWatchCount ?? 0,
        daily_watch_seconds: s.dailyWatchSeconds ?? 0,
      };
    }
    return out;
  }
}

module.exports = DeviceOrchestrator;
