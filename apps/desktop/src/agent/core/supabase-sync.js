/**
 * DoAi.Me - Supabase Integration
 * Handles worker registration, device sync, task management, and Realtime subscriptions
 * Supports both postgres_changes (fallback) and Broadcast channels (primary)
 */
const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const nodePath = require("path");

class SupabaseSync {
  constructor(supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey) {
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    // Service role client bypasses RLS — preferred for agent operations
    this.supabaseAdmin = supabaseServiceRoleKey
      ? createClient(supabaseUrl, supabaseServiceRoleKey)
      : null;
    // Use service role as primary client when available (agent is a trusted component)
    this.supabase = this.supabaseAdmin || anonClient;
    this.pcId = null;
    this.pcUuid = null;
    this.taskSubscription = null;
    this.broadcastSubscription = null;
    this.logSubscriptions = new Map(); // task_id → channel

    // Subscription status tracking
    this.broadcastStatus = null;
    this.pgChangesStatus = null;
    this.broadcastReceivedCount = 0;
    this.pgChangesReceivedCount = 0;
    this.lastTaskReceivedAt = null;
    this.lastTaskReceivedVia = null; // 'broadcast' | 'pg_changes' | 'poll'

    // Log pipeline stats
    this.logStats = { inserted: 0, failed: 0 };

    // Batch log buffer
    this._logBuffer = [];
    this._logFlushTimer = null;
    this._LOG_BATCH_SIZE = 50;
    this._LOG_FLUSH_INTERVAL = 3000;
    this._LOG_MAX_BUFFER = 500;
    this._flushing = false;
  }

  /**
   * Verify Supabase connection is working
   * @returns {Promise<boolean>}
   */
  async verifyConnection() {
    const { error } = await this.supabase
      .from("pcs")
      .select("id")
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }
    return true;
  }

  /**
   * Get or create PC by pc_number, return its UUID
   * @param {string} pcNumber - e.g. "PC00", "PC01" (^PC[0-9]{2}$)
   * @returns {Promise<string>} PC UUID
   */
  async getPcId(pcNumber) {
    const { data: existing, error: findErr } = await this.supabase
      .from("pcs")
      .select("id, pc_number")
      .eq("pc_number", pcNumber)
      .single();

    if (existing) {
      this.pcId = pcNumber;
      this.pcUuid = existing.id;
      console.log(`[Supabase] Found PC: ${pcNumber} (${existing.id})`);
      return pcNumber;
    }

    if (findErr && findErr.code !== "PGRST116") {
      throw new Error(`Failed to lookup PC: ${findErr.message}`);
    }

    const { data: created, error: createErr } = await this.supabase
      .from("pcs")
      .insert({ pc_number: pcNumber, status: "online" })
      .select("id")
      .single();

    if (createErr) {
      throw new Error(`Failed to create PC: ${createErr.message}`);
    }

    this.pcId = pcNumber;
    this.pcUuid = created.id;
    console.log(`[Supabase] Created PC: ${pcNumber} (${created.id})`);
    return pcNumber;
  }

  /**
   * Update PC heartbeat status
   * @param {string} pcId
   * @param {string} status - 'online' | 'offline' | 'error'
   */
  async updatePcStatus(pcId, status) {
    const update = {
      status,
      last_heartbeat: new Date().toISOString(),
    };

    const { error } = await this.supabase
      .from("pcs")
      .update(update)
      .eq("id", this.pcUuid);

    if (error) {
      console.error(`[Supabase] Failed to update PC status: ${error.message}`);
    }
  }

  /**
   * Upsert device record by serial_number
   * @param {string} serial
   * @param {string} pcId
   * @param {string} status
   * @param {string} model
   * @param {number|null} battery
   */
  async upsertDevice(serial, pcId, status, model, battery) {
    const { error } = await this.supabase
      .from("devices")
      .upsert(
        {
          serial_number: serial,
          pc_id: pcId,
          status,
          model: model || null,
          battery_level: battery || null,
          last_heartbeat: new Date().toISOString(),
        },
        { onConflict: "serial_number" }
      );

    if (error) {
      console.error(`[Supabase] Failed to upsert device ${serial}: ${error.message}`);
    }
  }

  /**
   * Batch upsert multiple devices in a single query.
   * serial = hardware serial (stable identity). connectionId = current Xiaowei target (IP:5555 or serial).
   * @param {Array<{serial: string, connectionId?: string, status?: string, model?: string, battery?: number, ipIntranet?: string, task_status?: string, current_assignment_id?: string, current_video_title?: string, watch_progress?: number, consecutive_errors?: number, daily_watch_count?: number, daily_watch_seconds?: number}>} devices
   * @param {string} pcId
   * @returns {Promise<Array>} upserted rows with id, serial_number
   */
  async batchUpsertDevices(devices, pcId) {
    if (!devices || devices.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const rows = devices.map(d => {
      const row = {
        serial_number: d.serial,
        pc_id: this.pcUuid,
        status: d.status || 'online',
        model: d.model || null,
        battery_level: d.battery ?? null,
        last_heartbeat: now,
      };
      if (d.connectionId != null) row.connection_id = d.connectionId;
      if (d.task_status != null) row.task_status = d.task_status;
      if (d.current_assignment_id != null) row.current_assignment_id = d.current_assignment_id;
      if (d.current_video_title != null) row.current_video_title = d.current_video_title;
      if (d.watch_progress != null) row.watch_progress = d.watch_progress;
      if (d.consecutive_errors != null) row.consecutive_errors = d.consecutive_errors;
      if (d.daily_watch_count != null) row.daily_watch_count = d.daily_watch_count;
      if (d.daily_watch_seconds != null) row.daily_watch_seconds = d.daily_watch_seconds;
      return row;
    });

    const { data, error } = await this.supabase
      .from('devices')
      .upsert(rows, { onConflict: 'serial_number' })
      .select('id, serial_number');

    if (error) {
      console.error(`[Supabase] Batch upsert failed: ${error.message} (code: ${error.code}, rows: ${rows.length})`);
      return [];
    }

    return data || [];
  }

  /**
   * Sync device task states from DeviceOrchestrator (task_status, watch_progress, etc.)
   * @param {Array<{serial: string, status?: string, assignmentId?: string|null, videoTitle?: string|null, watchProgress?: number, errorCount?: number, dailyWatchCount?: number, dailyWatchSeconds?: number}>} states
   */
  async syncDeviceTaskStates(states) {
    for (const state of states) {
      try {
        const { error } = await this.supabase
          .from("devices")
          .update({
            task_status: state.status ?? null,
            current_assignment_id: state.assignmentId ?? null,
            current_video_title: state.videoTitle ?? null,
            watch_progress: state.watchProgress ?? 0,
            consecutive_errors: state.errorCount ?? 0,
            daily_watch_count: state.dailyWatchCount ?? 0,
            daily_watch_seconds: state.dailyWatchSeconds ?? 0,
          })
          .eq("serial_number", state.serial);
        if (error) console.warn(`[Supabase] syncDeviceTaskStates failed for ${state.serial}: ${error.message}`);
      } catch (err) {
        console.warn(`[SupabaseSync] syncDeviceTaskStates error: ${err.message}`);
      }
    }
  }

  /**
   * Get task counts for a worker
   * @param {string} pcId
   * @returns {Promise<{running: number, pending: number, completed_today: number, failed_today: number}>}
   */
  async getTaskCounts(pcId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Running tasks
    const { count: running } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'running');

    // Pending tasks
    const { count: pending } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'pending');

    // Completed today
    const { count: completed_today } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'completed')
      .gte('completed_at', todayIso);

    // Failed today
    const { count: failed_today } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'failed')
      .gte('updated_at', todayIso);

    return {
      running: running || 0,
      pending: pending || 0,
      completed_today: completed_today || 0,
      failed_today: failed_today || 0,
    };
  }

  /**
   * Get proxy counts for a worker
   * @param {string} pcId
   * @returns {Promise<{total: number, valid: number, invalid: number, unassigned: number}>}
   */
  async getProxyCounts(pcId) {
    const { count: total } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid);

    const { count: valid } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'valid');

    const { count: invalid } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'invalid');

    const { count: unassigned } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .is('device_serial', null);

    return {
      total: total || 0,
      valid: valid || 0,
      invalid: invalid || 0,
      unassigned: unassigned || 0,
    };
  }

  /**
   * Get device counts for a worker
   * @param {string} pcId
   * @returns {Promise<{total: number, online: number, busy: number, error: number, offline: number}>}
   */
  async getDeviceCounts(pcId) {
    const { count: total } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid);

    const { count: online } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'online');

    const { count: busy } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'busy');

    const { count: error } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'error');

    const { count: offline } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('pc_id', this.pcUuid)
      .eq('status', 'offline');

    return {
      total: total || 0,
      online: online || 0,
      busy: busy || 0,
      error: error || 0,
      offline: offline || 0,
    };
  }

  /**
   * Get the ADB connection target (IP:port or serial) for a task_devices row.
   * Prefer device_target, then devices.connection_id (current IP:5555), then serial_number.
   * @param {Object} taskDevice - row from task_devices table
   * @returns {Promise<string|null>}
   */
  async getDeviceTargetForTaskDevice(taskDevice) {
    if (taskDevice.device_target) return taskDevice.device_target;
    if (!taskDevice.device_id) return taskDevice.device_serial || null;
    const { data } = await this.supabase
      .from('devices')
      .select('connection_id, ip_address, serial_number')
      .eq('id', taskDevice.device_id)
      .single();
    if (data?.connection_id) return data.connection_id;
    if (data?.ip_address) return typeof data.ip_address === 'string' ? data.ip_address : `${data.ip_address}:5555`;
    if (data?.serial_number) return data.serial_number;
    return taskDevice.device_serial || null;
  }

  /**
   * Mark devices not in the current list as offline, and optionally mark error serials as "error"
   * Phase 7: use mark_device_offline RPC so task_devices are rolled back (zombie cleanup).
   * @param {string} pcId
   * @param {string[]} activeSerials - serials currently connected
   * @param {string[]} [errorSerials] - serials to mark as "error" (e.g. recently missing, Xiaowei still connected)
   */
  async markOfflineDevices(pcId, activeSerials, errorSerials = []) {
    const now = new Date().toISOString();
    const errorSet = new Set(errorSerials);
    const activeSet = new Set(activeSerials);
    const allKnownSerials = [...new Set([...activeSerials, ...errorSerials])];

    if (allKnownSerials.length === 0) {
      const { data: allDevices } = await this.supabase
        .from("devices")
        .select("serial_number, serial")
        .eq("pc_id", this.pcUuid);
      const serials = (allDevices || []).map((d) => d.serial_number || d.serial).filter(Boolean);
      for (const ser of serials) {
        await this.supabase.rpc("mark_device_offline", { p_device_serial: ser }).catch(() => {});
      }
      return;
    }

    // Mark error serials as "error"
    if (errorSet.size > 0) {
      const errorArray = [...errorSet];
      const { error: errError } = await this.supabase
        .from("devices")
        .update({ status: "error", last_heartbeat: now })
        .eq("pc_id", this.pcUuid)
        .in("serial_number", errorArray);
      if (errError) {
        console.error(`[Supabase] Failed to mark error devices: ${errError.message}`);
      }
    }

    // Get serials to mark offline (on this PC, not in active list)
    const { data: toOffline } = await this.supabase
      .from("devices")
      .select("serial_number, serial")
      .eq("pc_id", this.pcUuid);
    const offlineSerials = (toOffline || [])
      .map((d) => d.serial_number || d.serial)
      .filter((s) => s && !activeSet.has(s));

    for (const ser of offlineSerials) {
      await this.supabase.rpc("mark_device_offline", { p_device_serial: ser }).catch(() => {});
    }
  }

  /**
   * Get pending tasks assigned to this PC or unassigned (pc_id=null).
   * Unassigned tasks are auto-claimed by setting pc_id.
   * @param {string} pcId
   * @returns {Promise<Array>}
   */
  async getPendingTasks(pcId) {
    const { data: assigned, error: assignedErr } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("pc_id", this.pcUuid)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (assignedErr) {
      console.error(`[Supabase] Failed to get assigned tasks: ${assignedErr.message}`);
    }

    const { data: unassigned, error: unassignedErr } = await this.supabase
      .from("tasks")
      .select("*")
      .is("pc_id", null)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (unassignedErr) {
      console.error(`[Supabase] Failed to get unassigned tasks: ${unassignedErr.message}`);
    }

    const claimed = [];
    for (const task of (unassigned || [])) {
      const { data: claimData, error: claimErr } = await this.supabase
        .from("tasks")
        .update({ pc_id: this.pcUuid })
        .eq("id", task.id)
        .is("pc_id", null)
        .select();

      if (claimErr) console.error(`[Supabase] Failed to claim task ${task.id}: ${claimErr.message}`);
      if (!claimErr && claimData && claimData.length > 0) {
        task.pc_id = this.pcUuid;
        claimed.push(task);
        console.log(`[Supabase] Claimed unassigned task: ${task.id}`);
      }
    }

    return [...(assigned || []), ...claimed];
  }

  /**
   * Update task status and optional result/error
   * @param {string} taskId
   * @param {string} status - 'pending' | 'running' | 'completed' | 'failed'
   * @param {object|null} result
   * @param {string|null} error
   */
  async updateTaskStatus(taskId, status, result, error) {
    const update = { status };

    if (status === "running") {
      update.started_at = new Date().toISOString();
    }
    if (status === "completed") {
      update.completed_at = new Date().toISOString();
    }
    if (result !== undefined && result !== null) {
      update.result = result;
    }
    if (error !== undefined && error !== null) {
      update.error = error;
    }

    const { error: updateErr } = await this.supabase
      .from("tasks")
      .update(update)
      .eq("id", taskId);

    if (updateErr) {
      console.error(`[Supabase] Failed to update task ${taskId}: ${updateErr.message}`);
    }
  }

  /**
   * Increment retry count for a failed task
   * @param {string} taskId
   */
  async incrementRetryCount(taskId) {
    // Read current value and increment
    const { data, error: readErr } = await this.supabase
      .from("tasks")
      .select("retries")
      .eq("id", taskId)
      .single();

    if (readErr) {
      console.error(`[Supabase] Failed to read retries: ${readErr.message}`);
      return;
    }

    const { error } = await this.supabase
      .from("tasks")
      .update({ retries: (data.retries || 0) + 1 })
      .eq("id", taskId);

    if (error) {
      console.error(`[Supabase] Failed to increment retries: ${error.message}`);
    }
  }

  /**
   * Insert an execution log entry (buffered — batched INSERT).
   * Returns immediately with { ok: true, logId: null }.
   * @param {string} executionId - task/execution ID
   * @param {string} deviceId - device serial or UUID (optional)
   * @param {string} action - action name (mapped to `status` column)
   * @param {object} data - request data
   * @param {object} details - response details
   * @param {string} statusLabel - 'success' | 'error' | 'warning' | 'info'
   * @param {string} message
   * @returns {{ok: boolean, logId: string|null}}
   */
  insertExecutionLog(executionId, deviceId, action, data, details, statusLabel, message) {
    const levelMap = { success: "info", error: "error", warning: "warn", info: "info" };
    const level = levelMap[statusLabel] || "info";
    // execution_logs.status check: only pending, running, completed, failed, skipped
    const statusMap = { success: "completed", error: "failed", warning: "failed", info: "completed" };
    const status = statusMap[statusLabel] || "completed";

    const entry = {
      execution_id: executionId,
      device_id: deviceId || null,
      status,
      data: data ? { ...data, _action: action } : { _action: action },
      details: details || null,
      level,
      message: message || null,
    };

    // Drop oldest entries if buffer exceeds hard cap
    if (this._logBuffer.length >= this._LOG_MAX_BUFFER) {
      const dropped = this._logBuffer.splice(0, this._logBuffer.length - this._LOG_MAX_BUFFER + 1);
      console.warn(`[Supabase] Log buffer overflow — dropped ${dropped.length} oldest entries`);
    }

    this._logBuffer.push(entry);

    // Flush if batch size reached
    if (this._logBuffer.length >= this._LOG_BATCH_SIZE) {
      this._flushLogBuffer().catch(() => {});
    }

    // Ensure flush timer is running
    this._startFlushTimer();

    return { ok: true, logId: null };
  }

  /**
   * Flush buffered log entries to Supabase in a single batch INSERT.
   */
  async _flushLogBuffer() {
    if (this._logBuffer.length === 0 || this._flushing) return;
    this._flushing = true;

    const entries = this._logBuffer.splice(0);

    try {
      const { error } = await this.supabase
        .from("execution_logs")
        .insert(entries);

      if (error) {
        // Put entries back for retry
        this._logBuffer.unshift(...entries);
        this.logStats.failed += entries.length;
        console.error(`[Supabase] Batch log insert failed (${entries.length} entries): ${error.message}`);
        this._flushing = false;
        return;
      }

      this.logStats.inserted += entries.length;
      console.log(`[Supabase] ✓ Batch log insert: ${entries.length} entries`);

      const grouped = {};
      for (const entry of entries) {
        const execId = entry.execution_id;
        if (!grouped[execId]) grouped[execId] = [];
        grouped[execId].push(entry);
      }
      for (const [execId, logs] of Object.entries(grouped)) {
        try {
          await this.supabase.rpc("broadcast_to_channel", {
            p_channel: `room:task:${execId}:logs`,
            p_event: "batch",
            p_payload: { logs, count: logs.length },
          });
        } catch (rpcErr) {
          console.error(`[Supabase] broadcast logs failed: ${rpcErr.message}`);
        }
      }

      // Append to local log file (non-blocking)
      try {
        const dateStr = new Date().toISOString().slice(0, 10);
        const logDir = nodePath.join(process.cwd(), "farm_logs");
        const logFile = nodePath.join(logDir, `${dateStr}.log`);
        if (!fs.existsSync(logDir)) {
          fs.mkdirSync(logDir, { recursive: true });
        }
        const lines = entries.map(e =>
          `${new Date().toISOString()} [${e.level}] exec=${e.execution_id} device=${e.device_id || "-"} status=${e.status} ${e.message || ""}`
        ).join("\n") + "\n";
        fs.appendFile(logFile, lines, () => {});
      } catch (_) {
        // Local file logging is best-effort
      }
    } catch (err) {
      // Network-level failure — put entries back
      this._logBuffer.unshift(...entries);
      this.logStats.failed += entries.length;
      console.error(`[Supabase] Batch log flush error: ${err.message}`);
    } finally {
      this._flushing = false;
    }
  }

  /** Start the periodic flush timer if not already running */
  _startFlushTimer() {
    if (this._logFlushTimer) return;
    this._logFlushTimer = setInterval(() => {
      this._flushLogBuffer().catch(() => {});
    }, this._LOG_FLUSH_INTERVAL);
    // Allow process to exit even if timer is running
    if (this._logFlushTimer.unref) {
      this._logFlushTimer.unref();
    }
  }

  /** Stop the periodic flush timer */
  _stopFlushTimer() {
    if (this._logFlushTimer) {
      clearInterval(this._logFlushTimer);
      this._logFlushTimer = null;
    }
  }

  /**
   * Flush remaining buffer and stop timer. Call on shutdown.
   */
  async flushAndClose() {
    this._stopFlushTimer();
    if (this._logBuffer.length > 0) {
      console.log(`[Supabase] Flushing ${this._logBuffer.length} remaining log entries...`);
      await this._flushLogBuffer();
    }
  }

  /**
   * Get log pipeline stats for diagnostics.
   * @returns {{inserted: number, failed: number, buffered: number}}
   */
  getLogStats() {
    return { ...this.logStats, buffered: this._logBuffer.length };
  }

  /**
   * Subscribe to tasks via Broadcast channel (primary).
   * Returns a Promise that resolves when subscription is confirmed or times out.
   * @param {string} pcId
   * @param {function} callback - called with new/updated task row
   * @param {number} timeoutMs - max time to wait for SUBSCRIBED status
   * @returns {Promise<{status: string, channel: object}>}
   */
  subscribeToBroadcast(pcId, callback, timeoutMs = 10000) {
    console.log(`[Supabase] Subscribing to Broadcast room:tasks for PC ${pcId}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ status: this.broadcastStatus || "TIMEOUT", channel: this.broadcastSubscription });
      }, timeoutMs);

      this.broadcastSubscription = this.supabase
        .channel("room:tasks")
        .on("broadcast", { event: "insert" }, ({ payload }) => {
          const task = payload?.record;
          if (!task) return;
          if (task.pc_id === this.pcUuid && task.status === "pending") {
            this.broadcastReceivedCount++;
            this.lastTaskReceivedAt = Date.now();
            this.lastTaskReceivedVia = "broadcast";
            console.log(`[Supabase] [Broadcast] 태스크 수신: ${task.id}`);
            callback(task);
          }
        })
        .on("broadcast", { event: "update" }, ({ payload }) => {
          const task = payload?.record;
          const oldTask = payload?.old_record;
          if (!task) return;
          if (
            task.pc_id === this.pcUuid &&
            task.status === "pending" &&
            (!oldTask || oldTask.status !== "pending")
          ) {
            this.broadcastReceivedCount++;
            this.lastTaskReceivedAt = Date.now();
            this.lastTaskReceivedVia = "broadcast";
            console.log(`[Supabase] [Broadcast] 태스크 재배정 수신: ${task.id}`);
            callback(task);
          }
        })
        .subscribe((status) => {
          this.broadcastStatus = status;
          console.log(`[Supabase] Broadcast room:tasks status: ${status}`);
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timeout);
            resolve({ status, channel: this.broadcastSubscription });
          }
        });
    });
  }

  /**
   * Subscribe to new tasks via postgres_changes (fallback).
   * Returns a Promise that resolves when subscription is confirmed or times out.
   * @param {string} pcId
   * @param {function} callback - called with new task row
   * @param {number} timeoutMs - max time to wait for SUBSCRIBED status
   * @returns {Promise<{status: string, channel: object}>}
   */
  subscribeToTasks(pcId, callback, timeoutMs = 10000) {
    console.log(`[Supabase] Subscribing to postgres_changes for PC ${pcId}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ status: this.pgChangesStatus || "TIMEOUT", channel: this.taskSubscription });
      }, timeoutMs);

      this.taskSubscription = this.supabase
        .channel("tasks-realtime")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tasks",
            filter: `pc_id=eq.${this.pcUuid}`,
          },
          (payload) => {
            this.pgChangesReceivedCount++;
            this.lastTaskReceivedAt = Date.now();
            this.lastTaskReceivedVia = "pg_changes";
            console.log(`[Supabase] [pg_changes] 태스크 수신: ${payload.new.id}`);
            callback(payload.new);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tasks",
            filter: `pc_id=eq.${this.pcUuid}`,
          },
          (payload) => {
            if (payload.new.status === "pending" && payload.old.status !== "pending") {
              this.pgChangesReceivedCount++;
              this.lastTaskReceivedAt = Date.now();
              this.lastTaskReceivedVia = "pg_changes";
              console.log(`[Supabase] [pg_changes] 태스크 재배정 수신: ${payload.new.id}`);
              callback(payload.new);
            }
          }
        )
        .subscribe((status) => {
          this.pgChangesStatus = status;
          console.log(`[Supabase] postgres_changes status: ${status}`);
          if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            clearTimeout(timeout);
            resolve({ status, channel: this.taskSubscription });
          }
        });
    });
  }

  /**
   * Subscribe to task log updates for a specific task via Broadcast
   * @param {string} taskId
   * @param {function} callback - called with new log entry
   * @returns {object} subscription channel
   */
  subscribeToTaskLogs(taskId, callback) {
    const channelName = `room:task:${taskId}:logs`;
    console.log(`[Supabase] Subscribing to ${channelName}`);

    const channel = this.supabase
      .channel(channelName)
      .on("broadcast", { event: "insert" }, ({ payload }) => {
        if (payload?.record) {
          callback(payload.record);
        }
      })
      .subscribe((status) => {
        console.log(`[Supabase] ${channelName} status: ${status}`);
      });

    this.logSubscriptions.set(taskId, channel);
    return channel;
  }

  /**
   * Unsubscribe from task log channel
   * @param {string} taskId
   */
  async unsubscribeFromTaskLogs(taskId) {
    const channel = this.logSubscriptions.get(taskId);
    if (channel) {
      await this.supabase.removeChannel(channel);
      this.logSubscriptions.delete(taskId);
      console.log(`[Supabase] Unsubscribed from room:task:${taskId}:logs`);
    }
  }

  /** Unsubscribe from all Realtime channels and flush logs */
  async unsubscribe() {
    // Flush remaining log buffer before disconnecting
    await this.flushAndClose();
    // Broadcast channel
    if (this.broadcastSubscription) {
      await this.supabase.removeChannel(this.broadcastSubscription);
      this.broadcastSubscription = null;
      console.log("[Supabase] Unsubscribed from Broadcast room:tasks");
    }

    // postgres_changes channel
    if (this.taskSubscription) {
      await this.supabase.removeChannel(this.taskSubscription);
      this.taskSubscription = null;
      console.log("[Supabase] Unsubscribed from postgres_changes");
    }

    // All task log channels
    for (const [taskId, channel] of this.logSubscriptions) {
      await this.supabase.removeChannel(channel);
      console.log(`[Supabase] Unsubscribed from room:task:${taskId}:logs`);
    }
    this.logSubscriptions.clear();
  }
  /**
   * Get current subscription status for diagnostics.
   * @returns {{broadcast: string|null, pgChanges: string|null, broadcastReceived: number, pgChangesReceived: number, lastVia: string|null}}
   */
  getSubscriptionStatus() {
    return {
      broadcast: this.broadcastStatus,
      pgChanges: this.pgChangesStatus,
      broadcastReceived: this.broadcastReceivedCount,
      pgChangesReceived: this.pgChangesReceivedCount,
      lastVia: this.lastTaskReceivedVia,
    };
  }
}

module.exports = SupabaseSync;
