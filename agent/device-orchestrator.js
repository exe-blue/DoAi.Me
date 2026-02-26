/**
 * DoAi.Me - Device Orchestrator
 * 디바이스별 상태 추적 및 작업 자동 배정.
 * claim_next_assignment RPC로 작업 선점 후 TaskExecutor로 실행.
 */
const { getLogger } = require("./common/logger");
const log = getLogger("device-orchestrator");
const presets = require("./device-presets");

const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const CIRCUIT_BREAKER_FAILURES = 3; // after this many consecutive failures, skip device for cooldown
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 min

class DeviceOrchestrator {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {import('./task-executor')} taskExecutor
   * @param {object} config - { pcId (UUID), maxConcurrent? }
   */
  constructor(xiaowei, supabase, taskExecutor, config) {
    this.xiaowei = xiaowei;
    this.supabase = supabase;
    this.taskExecutor = taskExecutor;
    this.pcId = config.pcId;
    this.maxConcurrent = config.maxConcurrent ?? 10;

    /** @type {Map<string, DeviceState>} serial -> state */
    this.deviceStates = new Map();
    this._pollTimer = null;
    this._runningAssignments = new Set(); // assignment id
    this._assignChannel = null;
    this._nudgeDebounce = null;
  }

  start() {
    if (this._pollTimer) return;
    log.info(`[DeviceOrchestrator] Starting (Realtime push + ${ORCHESTRATE_INTERVAL_MS / 1000}s fallback, maxConcurrent=${this.maxConcurrent})`);
    this._pollTimer = setInterval(() => this._orchestrate().catch((e) => log.error("[DeviceOrchestrator]", e)), ORCHESTRATE_INTERVAL_MS);
    this._subscribeToNewAssignments();
  }

  stop() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    if (this._assignChannel) {
      this.supabase.removeChannel(this._assignChannel);
      this._assignChannel = null;
    }
    if (this._nudgeDebounce) {
      clearTimeout(this._nudgeDebounce);
      this._nudgeDebounce = null;
    }
    log.info("[DeviceOrchestrator] Stopped");
  }

  /**
   * Immediate orchestration trigger. Called by:
   * - VideoDispatcher (new assignments created)
   * - Realtime subscription (new assignment INSERT)
   * - Self (after device finishes watching → pick up next immediately)
   * Debounced to 500ms to batch rapid events.
   */
  nudge() {
    if (!this._pollTimer) return;
    if (this._nudgeDebounce) return;
    this._nudgeDebounce = setTimeout(() => {
      this._nudgeDebounce = null;
      this._orchestrate().catch((e) => log.error("[DeviceOrchestrator] nudge:", e));
    }, 500);
  }

  /**
   * Realtime: new job_assignments INSERT for this PC → immediate claim
   */
  _subscribeToNewAssignments() {
    this._assignChannel = this.supabase
      .channel("orch-assign-push")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "job_assignments",
        filter: `pc_id=eq.${this.pcId}`,
      }, () => {
        log.info("[DeviceOrchestrator] ⚡ Realtime: new assignment → nudge");
        this.nudge();
      })
      .subscribe((status) => {
        log.info(`[DeviceOrchestrator] assignments Realtime: ${status}`);
      });
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
        devices = res.map((d) => d.onlySerial || d.serial || d.id || d.deviceId).filter(Boolean);
      } else if (res && typeof res === "object") {
        const data = res.data || res.devices || res.list;
        if (Array.isArray(data)) {
          devices = data.map((d) => d.onlySerial || d.serial || d.id || d.deviceId).filter(Boolean);
        } else {
          devices = Object.keys(res).filter((k) => !["action", "status", "code", "msg"].includes(k));
        }
      }
    } catch (err) {
      log.error("[DeviceOrchestrator] list error:", err.message);
      return;
    }

    for (const serial of devices) {
      this._ensureDeviceState(serial);
      const state = this.deviceStates.get(serial);
      const busy = !!(state.assignmentId && this._runningAssignments.has(state.assignmentId));
      log.info(`[Orchestrator] ${serial.substring(0, 6)} status=${state.status} busy=${busy}`);
      if (state.status === STATUS.idle) {
        if (state.circuitBreakerUntil && Date.now() < state.circuitBreakerUntil) {
          continue; // still in cooldown
        }
        await this._assignWork(serial);
        continue;
      }
      if (state.status === STATUS.free_watch) {
        const hasPending = await this._hasPendingAssignment();
        if (hasPending) {
          state.status = STATUS.idle;
          log.info(`[DeviceOrchestrator] ${serial.substring(0, 6)} free_watch → idle (pending work)`);
        }
        continue;
      }
      if (state.status === STATUS.watching && state.startedAt) {
        const elapsed = Date.now() - state.startedAt;
        if (elapsed > WATCH_TIMEOUT_MS) {
          log.warn(`[DeviceOrchestrator] ${serial.substring(0, 6)} watch timeout (${Math.round(elapsed / 60000)}m)`);
          const nextFailures = (state.consecutiveFailures || 0) + 1;
          const extra = nextFailures >= CIRCUIT_BREAKER_FAILURES
            ? { circuitBreakerUntil: Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS }
            : {};
          this._setState(serial, STATUS.error, { errorCount: (state.errorCount || 0) + 1, consecutiveFailures: nextFailures, ...extra });
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
        consecutiveFailures: 0,
        circuitBreakerUntil: null,
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
   * 동시 실행 수 체크 → claim_next_assignment → 있으면 실행, 없으면 free_watch 여부
   */
  async _assignWork(serial) {
    const running = this._runningAssignments.size;
    log.info(`[Orchestrator] _assignWork(${serial.substring(0, 6)}) active=${running}/${this.maxConcurrent}`);
    if (running >= this.maxConcurrent) return;

    log.info(`[Orchestrator] calling claim_next_assignment pcId=${this.pcId}`);
    const assignment = await this._getNextAssignment(serial);
    log.info(`[Orchestrator] claim result: ${assignment ? assignment.id.substring(0, 8) : "null"}`);
    if (assignment) {
      const jobId = assignment.job_id;
      const sameJobCount = await this._countDevicesOnJob(jobId);
      if (sameJobCount > SAME_JOB_MAX_DEVICES) {
        await this._releaseAssignment(assignment.id);
        return;
      }
      this._setState(serial, STATUS.searching, { assignmentId: assignment.id, videoTitle: assignment.video_title || null });
      this._executeTargetWatch(serial, assignment).catch((err) => {
        log.error(`[DeviceOrchestrator] ${serial.substring(0, 6)} target watch error:`, err.message);
        this._runningAssignments.delete(assignment.id);
        const s = this.deviceStates.get(serial) || {};
        const nextFailures = (s.consecutiveFailures || 0) + 1;
        const extra = nextFailures >= CIRCUIT_BREAKER_FAILURES
          ? { circuitBreakerUntil: Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS }
          : {};
        this._setState(serial, STATUS.error, {
          errorCount: (s.errorCount || 0) + 1,
          consecutiveFailures: nextFailures,
          ...extra,
        });
      });
      return;
    }

    log.info(`[Orchestrator] ${serial.substring(0, 6)} no assignment → checking free_watch`);
    const hasPending = await this._hasPendingAssignment();
    if (!hasPending) {
      this._setState(serial, STATUS.free_watch);
      this._executeFreeWatch(serial).catch((err) => {
        log.error(`[DeviceOrchestrator] ${serial.substring(0, 6)} free watch error:`, err.message);
        this._setState(serial, STATUS.idle);
      });
    }
  }

  /**
   * RPC claim_next_assignment: 3-arg (pc_id, device_id, device_serial) when device_id known, else 2-arg for compatibility.
   */
  async _getNextAssignment(serial) {
    try {
      const { data: devRows } = await this.supabase
        .from("devices")
        .select("id")
        .eq("pc_id", this.pcId)
        .eq("serial_number", serial)
        .limit(1);
      const deviceId = devRows && devRows[0] ? devRows[0].id : null;

      const rpcParams = deviceId
        ? { p_pc_id: this.pcId, p_device_id: deviceId, p_device_serial: serial }
        : { p_pc_id: this.pcId, p_device_serial: serial };
      const { data, error } = await this.supabase.rpc("claim_next_assignment", rpcParams);
      if (error) {
        log.warn("[DeviceOrchestrator] claim_next_assignment error:", error.message);
        return null;
      }
      if (Array.isArray(data) && data.length > 0) return data[0];
      if (data && typeof data === "object" && data.id) return data;
      return null;
    } catch (err) {
      log.warn("[DeviceOrchestrator] _getNextAssignment:", err.message);
      return null;
    }
  }

  async _hasPendingAssignment() {
    try {
      const { data: devs } = await this.supabase
        .from("devices")
        .select("id")
        .eq("pc_id", this.pcId);
      if (!devs || devs.length === 0) return false;
      const deviceIds = devs.map((d) => d.id);
      const { count, error } = await this.supabase
        .from("job_assignments")
        .select("id", { count: "exact", head: true })
        .in("device_id", deviceIds)
        .eq("status", "pending");
      if (error) return false;
      return (count || 0) > 0;
    } catch {
      return false;
    }
  }

  async _countDevicesOnJob(jobId) {
    try {
      const { count, error } = await this.supabase
        .from("job_assignments")
        .select("id", { count: "exact", head: true })
        .eq("job_id", jobId)
        .in("status", ["pending", "running"]);
      if (error) return 0;
      return count || 0;
    } catch {
      return 0;
    }
  }

  async _releaseAssignment(assignmentId) {
    try {
      await this.supabase
        .from("job_assignments")
        .update({ status: "pending" })
        .eq("id", assignmentId);
    } catch (err) {
      log.warn("[DeviceOrchestrator] _releaseAssignment:", err.message);
    }
  }

  /**
   * device-presets warmup → 완료 후 idle → nudge (즉시 대기열 확인)
   */
  async _executeFreeWatch(serial) {
    const state = this.deviceStates.get(serial);
    if (state?.status !== STATUS.free_watch) return;
    try {
      await presets.warmup(this.xiaowei, serial, { durationSec: 120 });
      log.info(`[Orchestrator] ${serial.substring(0, 6)} warmup done → idle`);
      this._setState(serial, STATUS.idle);
      const s = this.deviceStates.get(serial);
      if (s) {
        s.dailyWatchCount = (s.dailyWatchCount || 0) + 1;
        s.dailyWatchSeconds = (s.dailyWatchSeconds || 0) + 120;
        s.lastTaskAt = new Date().toISOString();
      }
      setImmediate(() => this.nudge());
    } catch (err) {
      this._setState(serial, STATUS.idle);
      throw err;
    }
  }

  /**
   * TaskExecutor로 검색+시청 실행. searching → watching → completing → idle → nudge (즉시 다음 작업)
   */
  async _executeTargetWatch(serial, assignment) {
    this._runningAssignments.add(assignment.id);
    const state = this.deviceStates.get(serial);
    state.status = STATUS.watching;
    state.startedAt = Date.now();
    state.videoTitle = assignment.video_title || null;

    try {
      if (this.taskExecutor.runAssignment) {
        await this.taskExecutor.runAssignment(assignment);
      } else {
        await this.taskExecutor._executeJobAssignment(assignment);
      }
    } finally {
      this._runningAssignments.delete(assignment.id);
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
    s.consecutiveFailures = 0;
    s.circuitBreakerUntil = null;
    s.status = STATUS.idle;

    // Immediately try to pick up next assignment (no 3s wait)
    setImmediate(() => this.nudge());
  }

  /**
   * error 상태 복구: circuit breaker cooldown 경과 후에만 YouTube 재시작 → idle
   */
  async _tryRecoverError(serial) {
    const state = this.deviceStates.get(serial);
    if (state.status !== STATUS.error) return;
    if (state.circuitBreakerUntil && Date.now() < state.circuitBreakerUntil) {
      return; // still in cooldown
    }
    try {
      await this.xiaowei.stopApk(serial, "com.google.android.youtube");
      await _sleep(1000);
      this._setState(serial, STATUS.idle, { errorCount: 0, consecutiveFailures: 0, circuitBreakerUntil: null });
      log.info(`[DeviceOrchestrator] ${serial.substring(0, 6)} recovered from error → idle`);
    } catch (err) {
      log.warn(`[DeviceOrchestrator] ${serial.substring(0, 6)} recover failed:`, err.message);
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
