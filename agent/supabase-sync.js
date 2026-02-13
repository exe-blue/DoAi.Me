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
    this.workerId = null;
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
      .from("workers")
      .select("id")
      .limit(1);

    if (error) {
      throw new Error(error.message);
    }
    return true;
  }

  /**
   * Get or create worker by hostname, return its UUID
   * @param {string} hostname
   * @returns {Promise<string>} worker UUID
   */
  async getWorkerId(hostname) {
    // Try to find existing worker
    const { data: existing, error: findErr } = await this.supabase
      .from("workers")
      .select("id")
      .eq("hostname", hostname)
      .single();

    if (existing) {
      this.workerId = existing.id;
      console.log(`[Supabase] Found worker: ${this.workerId}`);
      return this.workerId;
    }

    if (findErr && findErr.code !== "PGRST116") {
      // PGRST116 = no rows found, anything else is a real error
      throw new Error(`Failed to lookup worker: ${findErr.message}`);
    }

    // Create new worker
    const { data: created, error: createErr } = await this.supabase
      .from("workers")
      .insert({ hostname, status: "online" })
      .select("id")
      .single();

    if (createErr) {
      throw new Error(`Failed to create worker: ${createErr.message}`);
    }

    this.workerId = created.id;
    console.log(`[Supabase] Created worker: ${this.workerId}`);
    return this.workerId;
  }

  /**
   * Update worker heartbeat status
   * @param {string} workerId
   * @param {string} status - 'online' | 'offline' | 'error'
   * @param {number} deviceCount
   * @param {boolean} xiaoweiConnected
   * @param {object|null} metadata - optional metadata (execution stats, subscription status, etc.)
   */
  async updateWorkerStatus(workerId, status, deviceCount, xiaoweiConnected, metadata) {
    const update = {
      status,
      device_count: deviceCount,
      xiaowei_connected: xiaoweiConnected,
      last_heartbeat: new Date().toISOString(),
    };

    if (metadata !== undefined && metadata !== null) {
      update.metadata = metadata;
    }

    const { error } = await this.supabase
      .from("workers")
      .update(update)
      .eq("id", workerId);

    if (error) {
      console.error(`[Supabase] Failed to update worker status: ${error.message}`);
    }
  }

  /**
   * Upsert device record by serial
   * @param {string} serial
   * @param {string} workerId
   * @param {string} status
   * @param {string} model
   * @param {number|null} battery
   * @param {string|null} ipIntranet
   */
  async upsertDevice(serial, workerId, status, model, battery, ipIntranet) {
    const { error } = await this.supabase
      .from("devices")
      .upsert(
        {
          serial,
          worker_id: workerId,
          status,
          model: model || null,
          battery_level: battery || null,
          ip_intranet: ipIntranet || null,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "serial" }
      );

    if (error) {
      console.error(`[Supabase] Failed to upsert device ${serial}: ${error.message}`);
    }
  }

  /**
   * Batch upsert multiple devices in a single query
   * @param {Array<{serial: string, status: string, model?: string, battery?: number, ipIntranet?: string}>} devices
   * @param {string} workerId
   * @returns {Promise<boolean>} success status
   */
  async batchUpsertDevices(devices, workerId) {
    if (!devices || devices.length === 0) {
      return true;
    }

    const rows = devices.map(d => ({
      serial: d.serial,
      worker_id: workerId,
      status: d.status || 'online',
      model: d.model || null,
      battery_level: d.battery || null,
      ip_intranet: d.ipIntranet || null,
      last_seen: new Date().toISOString(),
    }));

    const { error } = await this.supabase
      .from('devices')
      .upsert(rows, { onConflict: 'serial' });

    if (error) {
      console.error(`[Supabase] Batch upsert failed: ${error.message}`);
      return false;
    }

    return true;
  }

  /**
   * Get task counts for a worker
   * @param {string} workerId
   * @returns {Promise<{running: number, pending: number, completed_today: number, failed_today: number}>}
   */
  async getTaskCounts(workerId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // Running tasks
    const { count: running } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'running');

    // Pending tasks
    const { count: pending } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'pending');

    // Completed today
    const { count: completed_today } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'completed')
      .gte('completed_at', todayIso);

    // Failed today
    const { count: failed_today } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
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
   * @param {string} workerId
   * @returns {Promise<{total: number, valid: number, invalid: number, unassigned: number}>}
   */
  async getProxyCounts(workerId) {
    // Total proxies assigned to this worker
    const { count: total } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId);

    // Valid proxies
    const { count: valid } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'valid');

    // Invalid proxies
    const { count: invalid } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'invalid');

    // Unassigned proxies (no device_serial)
    const { count: unassigned } = await this.supabase
      .from('proxies')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
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
   * @param {string} workerId
   * @returns {Promise<{total: number, online: number, busy: number, error: number, offline: number}>}
   */
  async getDeviceCounts(workerId) {
    const { count: total } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId);

    const { count: online } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'online');

    const { count: busy } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'busy');

    const { count: error } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
      .eq('status', 'error');

    const { count: offline } = await this.supabase
      .from('devices')
      .select('*', { count: 'exact', head: true })
      .eq('worker_id', workerId)
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
   * Mark devices not in the current list as offline
   * @param {string} workerId
   * @param {string[]} activeSerials - serials currently connected
   */
  async markOfflineDevices(workerId, activeSerials) {
    if (!activeSerials.length) {
      // All devices offline for this worker
      const { error } = await this.supabase
        .from("devices")
        .update({ status: "offline", last_seen: new Date().toISOString() })
        .eq("worker_id", workerId);

      if (error) {
        console.error(`[Supabase] Failed to mark devices offline: ${error.message}`);
      }
      return;
    }

    const { error } = await this.supabase
      .from("devices")
      .update({ status: "offline", last_seen: new Date().toISOString() })
      .eq("worker_id", workerId)
      .not("serial", "in", `(${activeSerials.join(",")})`);

    if (error) {
      console.error(`[Supabase] Failed to mark offline devices: ${error.message}`);
    }
  }

  /**
   * Get pending tasks assigned to this worker OR unassigned (worker_id=null).
   * Unassigned tasks are auto-claimed by setting worker_id to this worker.
   * @param {string} workerId
   * @returns {Promise<Array>}
   */
  async getPendingTasks(workerId) {
    // 1. Get tasks assigned to this worker
    const { data: assigned, error: assignedErr } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("worker_id", workerId)
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    if (assignedErr) {
      console.error(`[Supabase] Failed to get assigned tasks: ${assignedErr.message}`);
    }

    // 2. Get unassigned tasks (worker_id is null)
    const { data: unassigned, error: unassignedErr } = await this.supabase
      .from("tasks")
      .select("*")
      .is("worker_id", null)
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    if (unassignedErr) {
      console.error(`[Supabase] Failed to get unassigned tasks: ${unassignedErr.message}`);
    }

    // 3. Auto-claim unassigned tasks
    const claimed = [];
    for (const task of (unassigned || [])) {
      const { data: claimData, error: claimErr } = await this.supabase
        .from("tasks")
        .update({ worker_id: workerId })
        .eq("id", task.id)
        .is("worker_id", null) // Ensure no race condition
        .select();

      if (!claimErr && claimData && claimData.length > 0) {
        task.worker_id = workerId;
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
      .select("retry_count")
      .eq("id", taskId)
      .single();

    if (readErr) {
      console.error(`[Supabase] Failed to read retry_count: ${readErr.message}`);
      return;
    }

    const { error } = await this.supabase
      .from("tasks")
      .update({ retry_count: (data.retry_count || 0) + 1 })
      .eq("id", taskId);

    if (error) {
      console.error(`[Supabase] Failed to increment retry_count: ${error.message}`);
    }
  }

  /**
   * Insert a task execution log entry (buffered — batched INSERT).
   * Returns immediately with { ok: true, logId: null }.
   * @param {string} taskId
   * @param {string} deviceSerial
   * @param {string} workerId
   * @param {string} action
   * @param {object} request
   * @param {object} response
   * @param {string} status - 'success' | 'error' | 'warning' | 'info'
   * @param {string} message
   * @returns {{ok: boolean, logId: string|null}}
   */
  insertTaskLog(taskId, deviceSerial, workerId, action, request, response, status, message) {
    // Map status to log_level enum: debug/info/warn/error/fatal
    const levelMap = { success: "info", error: "error", warning: "warn", info: "info" };
    const level = levelMap[status] || "info";

    const entry = {
      task_id: taskId,
      device_serial: deviceSerial,
      worker_id: workerId,
      action,
      request: request || null,
      response: response || null,
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
        .from("task_logs")
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

      // Broadcast logs grouped by task_id
      const grouped = {};
      for (const entry of entries) {
        if (!grouped[entry.task_id]) grouped[entry.task_id] = [];
        grouped[entry.task_id].push(entry);
      }
      for (const [taskId, logs] of Object.entries(grouped)) {
        await this.supabase.rpc("broadcast_to_channel", {
          p_channel: `room:task:${taskId}:logs`,
          p_event: "batch",
          p_payload: { logs, count: logs.length },
        }).catch(err => console.error(`[Supabase] broadcast logs failed: ${err.message}`));
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
          `${new Date().toISOString()} [${e.level}] task=${e.task_id} device=${e.device_serial} action=${e.action} ${e.message || ""}`
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
   * @param {string} workerId
   * @param {function} callback - called with new/updated task row
   * @param {number} timeoutMs - max time to wait for SUBSCRIBED status
   * @returns {Promise<{status: string, channel: object}>}
   */
  subscribeToBroadcast(workerId, callback, timeoutMs = 10000) {
    console.log(`[Supabase] Subscribing to Broadcast room:tasks for worker ${workerId}`);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ status: this.broadcastStatus || "TIMEOUT", channel: this.broadcastSubscription });
      }, timeoutMs);

      this.broadcastSubscription = this.supabase
        .channel("room:tasks")
        .on("broadcast", { event: "insert" }, ({ payload }) => {
          const task = payload?.record;
          if (!task) return;
          if (task.worker_id === workerId && task.status === "pending") {
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
            task.worker_id === workerId &&
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
   * @param {string} workerId
   * @param {function} callback - called with new task row
   * @param {number} timeoutMs - max time to wait for SUBSCRIBED status
   * @returns {Promise<{status: string, channel: object}>}
   */
  subscribeToTasks(workerId, callback, timeoutMs = 10000) {
    console.log(`[Supabase] Subscribing to postgres_changes for worker ${workerId}`);

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
            filter: `worker_id=eq.${workerId}`,
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
            filter: `worker_id=eq.${workerId}`,
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
