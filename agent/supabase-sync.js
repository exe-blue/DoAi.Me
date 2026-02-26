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
    const { error } = await this.supabase.from("pcs").select("id").limit(1);

    if (error) {
      throw new Error(error.message);
    }
    return true;
  }

  /**
   * Get or create PC by pc_number, return its UUID
   * @param {string} pcNumber - e.g. "PC-00", "PC-01"
   * @returns {Promise<string>} PC UUID
   */
  async getPcId(pcNumber) {
    const { data: existing, error: findErr } = await this.supabase
      .from("pcs")
      .select("id, pc_number")
      .eq("pc_number", pcNumber)
      .single();

    if (existing) {
      this.pcId = existing.id;
      console.log(`[Supabase] Found PC: ${this.pcId} (${pcNumber})`);
      return this.pcId;
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

    this.pcId = created.id;
    console.log(`[Supabase] Created PC: ${this.pcId} (${pcNumber})`);
    return this.pcId;
  }

  /**
   * Update PC heartbeat status (명세 4.3: worker_id, agent_version, status, system)
   * @param {string} pcId
   * @param {string} status - 'online' | 'offline' | 'error'
   * @param {{ agent_version?: string, system?: { cpu_usage?: number, memory_free_mb?: number, adb_server_ok?: boolean, usb_devices_count?: number, uptime_seconds?: number } }} opts
   */
  async updatePcStatus(pcId, status, opts = {}) {
    const update = {
      status,
      last_heartbeat: new Date().toISOString(),
    };
    if (opts.agent_version != null) update.agent_version = opts.agent_version;
    if (opts.system != null) update.system = opts.system;

    const { error } = await this.supabase
      .from("pcs")
      .update(update)
      .eq("id", pcId);

    if (error) {
      console.error(`[Supabase] Failed to update PC status: ${error.message}`);
    }
  }

  /**
   * Upsert device record by serial
   * @param {string} serial
   * @param {string} pcId
   * @param {string} status
   * @param {string} model
   * @param {number|null} battery
   */
  async upsertDevice(serial, pcId, status, model, battery) {
    const { error } = await this.supabase.from("devices").upsert(
      {
        serial,
        pc_id: pcId,
        status,
        model: model || null,
        battery_level: battery || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "serial" },
    );

    if (error) {
      console.error(
        `[Supabase] Failed to upsert device ${serial}: ${error.message}`,
      );
    }
  }

  /**
   * Batch upsert multiple devices in a single query
   * @param {Array<{serial: string, status: string, model?: string, battery?: number, ipIntranet?: string}>} devices
   * @param {string} pcId
   * @returns {Promise<boolean>} success status
   */
  /**
   * @param {Array<{serial: string, status?: string, model?: string, battery?: number, ipIntranet?: string, task_status?: string, current_assignment_id?: string, current_video_title?: string, watch_progress?: number, consecutive_errors?: number, daily_watch_count?: number, daily_watch_seconds?: number}>} devices
   */
  async batchUpsertDevices(devices, pcId) {
    if (!devices || devices.length === 0) {
      return true;
    }

    const now = new Date().toISOString();
    const rows = devices.map((d) => {
      const row = {
        serial: d.serial,
        pc_id: pcId,
        status: d.status || "online",
        model: d.model || null,
        battery_level: d.battery ?? null,
        last_seen_at: now,
      };
      if (d.ipIntranet != null) row.ip_intranet = d.ipIntranet;
      if (d.task_status != null) row.task_status = d.task_status;
      if (d.current_assignment_id != null)
        row.current_assignment_id = d.current_assignment_id;
      if (d.current_video_title != null)
        row.current_video_title = d.current_video_title;
      if (d.watch_progress != null) row.watch_progress = d.watch_progress;
      if (d.consecutive_errors != null)
        row.consecutive_errors = d.consecutive_errors;
      if (d.daily_watch_count != null)
        row.daily_watch_count = d.daily_watch_count;
      if (d.daily_watch_seconds != null)
        row.daily_watch_seconds = d.daily_watch_seconds;
      if (d.device_code != null) row.device_code = d.device_code;
      if (d.proxy_id != null) row.proxy_id = d.proxy_id;
      if (d.account_id != null) row.account_id = d.account_id;
      if (d.current_task_id != null) row.current_task_id = d.current_task_id;
      if (d.connectionId != null) row.connection_id = d.connectionId;
      return row;
    });

    const { error } = await this.supabase
      .from("devices")
      .upsert(rows, { onConflict: "serial" });

    if (error) {
      console.error(`[Supabase] Batch upsert failed: ${error.message}`);
      return false;
    }

    return true;
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
          .eq("serial", state.serial);
        if (error)
          console.warn(
            `[Supabase] syncDeviceTaskStates failed for ${state.serial}: ${error.message}`,
          );
      } catch (err) {
        console.warn(
          `[SupabaseSync] syncDeviceTaskStates error: ${err.message}`,
        );
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
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "running");

    // Pending tasks
    const { count: pending } = await this.supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "pending");

    // Completed today
    const { count: completed_today } = await this.supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "completed")
      .gte("completed_at", todayIso);

    // Failed today
    const { count: failed_today } = await this.supabase
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "failed")
      .gte("updated_at", todayIso);

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
      .from("proxies")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId);

    const { count: valid } = await this.supabase
      .from("proxies")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "valid");

    const { count: invalid } = await this.supabase
      .from("proxies")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "invalid");

    const { count: unassigned } = await this.supabase
      .from("proxies")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .is("device_serial", null);

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
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId);

    const { count: online } = await this.supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "online");

    const { count: busy } = await this.supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "busy");

    const { count: error } = await this.supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "error");

    const { count: offline } = await this.supabase
      .from("devices")
      .select("*", { count: "exact", head: true })
      .eq("pc_id", pcId)
      .eq("status", "offline");

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
   * @param {string} pcId
   * @param {string[]} activeSerials - serials currently connected
   */
  async markOfflineDevices(pcId, activeSerials) {
    if (!activeSerials.length) {
      const { error } = await this.supabase
        .from("devices")
        .update({ status: "offline", last_seen_at: new Date().toISOString() })
        .eq("pc_id", pcId);

      if (error) {
        console.error(
          `[Supabase] Failed to mark devices offline: ${error.message}`,
        );
      }
      return;
    }

    const { error } = await this.supabase
      .from("devices")
      .update({ status: "offline", last_seen_at: new Date().toISOString() })
      .eq("pc_id", pcId)
      .not("serial", "in", `(${activeSerials.join(",")})`);

    if (error) {
      console.error(
        `[Supabase] Failed to mark offline devices: ${error.message}`,
      );
    }
  }

  /**
   * Get Xiaowei execution targets for this PC: connection_id ?? serial per device.
   * @param {string} pcId
   * @param {string[]|null} [serials] - If provided, only these serials (same PC); else all online/busy.
   * @returns {Promise<string[]>} Array of device targets (connection_id or serial)
   */
  async getDeviceTargetsForExecution(pcId, serials = null) {
    let query = this.supabase
      .from("devices")
      .select("serial, connection_id")
      .eq("pc_id", pcId);
    if (serials && serials.length > 0) {
      query = query.in("serial", serials);
    } else {
      query = query.in("status", ["online", "busy"]);
    }
    const { data, error } = await query;
    if (error) {
      console.error(
        `[Supabase] getDeviceTargetsForExecution failed: ${error.message}`,
      );
      return [];
    }
    return (data || []).map((d) => d.connection_id || d.serial).filter(Boolean);
  }

  /**
   * Get single device_target (connection_id ?? serial) for a task_device row.
   * Supports both device_id (SSOT) and legacy device_serial.
   * @param {object} taskDevice - { device_id?, device_serial?, pc_id? }
   * @returns {Promise<string|null>}
   */
  async getDeviceTargetForTaskDevice(taskDevice) {
    if (taskDevice?.device_id) {
      const { data, error } = await this.supabase
        .from("devices")
        .select("connection_id, serial")
        .eq("id", taskDevice.device_id)
        .maybeSingle();
      if (!error && data) return data.connection_id || data.serial || null;
    }
    if (!taskDevice?.device_serial) return null;
    let pcId = taskDevice.pc_id;
    if (!pcId) {
      const { data: dev } = await this.supabase
        .from("devices")
        .select("pc_id")
        .eq("serial", taskDevice.device_serial)
        .maybeSingle();
      pcId = dev?.pc_id;
    }
    if (!pcId) return taskDevice.device_serial;
    const { data, error } = await this.supabase
      .from("devices")
      .select("serial, connection_id")
      .eq("pc_id", pcId)
      .eq("serial", taskDevice.device_serial)
      .maybeSingle();
    if (error || !data) return taskDevice.device_serial;
    return data.connection_id || data.serial || taskDevice.device_serial;
  }

  /**
   * Claim up to `limit` queued task_devices for this PC (atomic RPC).
   * Uses claim_task_devices_for_pc(runner_pc_id, max_to_claim, lease_minutes).
   * @param {string} pcId
   * @param {number} [limit=10]
   * @returns {Promise<Array>} Claimed task_device rows
   */
  async claimNextTaskDevices(pcId, limit = 10, leaseMinutes = 5) {
    const { data, error } = await this.supabase.rpc("claim_task_devices_for_pc", {
      runner_pc_id: pcId,
      max_to_claim: Math.min(Math.max(0, limit), 100),
      lease_minutes: leaseMinutes,
    });
    if (error) {
      console.error(
        `[Supabase] claim_task_devices_for_pc failed: ${error.message}`,
      );
      return [];
    }
    return Array.isArray(data) ? data : [];
  }

  /**
   * Extend lease for a running task_device (heartbeat). Uses renew_task_device_lease RPC.
   * @param {string} taskDeviceId
   * @param {string} pcId
   * @param {number} [leaseMinutes=5]
   */
  async heartbeatTaskDevice(taskDeviceId, pcId, leaseMinutes = 5) {
    const { data, error } = await this.supabase.rpc("renew_task_device_lease", {
      task_device_id: taskDeviceId,
      runner_pc_id: pcId,
      lease_minutes: leaseMinutes,
    });
    if (error) {
      console.error(
        `[Supabase] renew_task_device_lease failed: ${error.message}`,
      );
    }
  }

  /**
   * Mark task_device completed. Uses complete_task_device RPC.
   * @param {string} taskDeviceId
   * @param {string} pcId
   * @param {object} [result]
   * @param {number} [progress=100]
   */
  async completeTaskDevice(taskDeviceId, pcId, resultJson = null, _progress = 100) {
    const payload = resultJson != null ? resultJson : { progress: _progress ?? 100 };
    const { error } = await this.supabase.rpc("complete_task_device", {
      task_device_id: taskDeviceId,
      runner_pc_id: pcId,
      result_json: payload,
    });
    if (error) {
      console.error(
        `[Supabase] complete_task_device failed: ${error.message}`,
      );
    }
  }

  /**
   * Mark task_device failed or requeue for retry. Uses fail_or_retry_task_device RPC.
   * @param {string} taskDeviceId
   * @param {string} pcId
   * @param {string} errorMessage
   * @param {boolean} [retryable=true]
   */
  async failOrRetryTaskDevice(taskDeviceId, pcId, errorMessage, retryable = true) {
    const { data, error } = await this.supabase.rpc("fail_or_retry_task_device", {
      task_device_id: taskDeviceId,
      runner_pc_id: pcId,
      error_text: errorMessage,
      retryable,
    });
    if (error) {
      console.error(
        `[Supabase] fail_or_retry_task_device failed: ${error.message}`,
      );
      return;
    }
    if (data && data.length > 0 && data[0]) {
      const row = data[0];
      const retryCount = row.retry_count_out ?? row.retry_count;
      if (row.final_status === "queued") {
        console.log(
          `[Supabase] task_device ${taskDeviceId} requeued (retry ${retryCount})`,
        );
      }
    }
  }

  /** RPC claim_task_devices_for_pc. Returns claimed task_device rows. */
  async claimTaskDevicesForPc(pcId, limit = 10) {
    const leaseMin = 5;
    const { data, error } = await this.supabase.rpc("claim_task_devices_for_pc", {
      runner_pc_id: pcId,
      max_to_claim: Math.min(Math.max(0, limit), 100),
      lease_minutes: leaseMin,
    });
    if (error) {
      console.error(`[Supabase] claim_task_devices_for_pc failed: ${error.message}`);
      return [];
    }
    return Array.isArray(data) ? data : [];
  }

  /** RPC renew_task_device_lease (30s heartbeat). */
  async renewTaskDeviceLease(taskDeviceId, pcId, leaseMinutes = 5) {
    const { error } = await this.supabase.rpc("renew_task_device_lease", {
      task_device_id: taskDeviceId,
      runner_pc_id: pcId,
      lease_minutes: leaseMinutes,
    });
    if (error) {
      console.error(`[Supabase] renew_task_device_lease failed: ${error.message}`);
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
      .eq("pc_id", pcId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (assignedErr) {
      console.error(
        `[Supabase] Failed to get assigned tasks: ${assignedErr.message}`,
      );
    }

    const { data: unassigned, error: unassignedErr } = await this.supabase
      .from("tasks")
      .select("*")
      .is("pc_id", null)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (unassignedErr) {
      console.error(
        `[Supabase] Failed to get unassigned tasks: ${unassignedErr.message}`,
      );
    }

    const claimed = [];
    for (const task of unassigned || []) {
      const { data: claimData, error: claimErr } = await this.supabase
        .from("tasks")
        .update({ pc_id: pcId })
        .eq("id", task.id)
        .is("pc_id", null)
        .select();

      if (claimErr)
        console.error(
          `[Supabase] Failed to claim task ${task.id}: ${claimErr.message}`,
        );
      if (!claimErr && claimData && claimData.length > 0) {
        task.pc_id = pcId;
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
      console.error(
        `[Supabase] Failed to update task ${taskId}: ${updateErr.message}`,
      );
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
   * 명세 4.1 에러 로그: Agent 레벨 오류를 command_logs에 기록 (Supabase 유지)
   * @param {string} message - 오류 메시지
   * @param {object} [details] - 추가 정보
   */
  async insertAgentErrorLog(message, details = {}) {
    try {
      const { error } = await this.supabase.from("command_logs").insert({
        command: "agent_error",
        target_type: "all",
        status: "completed",
        initiated_by: "agent",
        worker_id: this.pcId || null,
        results: [{ error: message, ...details }],
        completed_at: new Date().toISOString(),
      });
      if (error)
        console.error(
          `[Supabase] insertAgentErrorLog failed: ${error.message}`,
        );
    } catch (err) {
      console.error(`[Supabase] insertAgentErrorLog: ${err.message}`);
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
  insertExecutionLog(
    executionId,
    deviceId,
    action,
    data,
    details,
    statusLabel,
    message,
  ) {
    const levelMap = {
      success: "info",
      error: "error",
      warning: "warn",
      info: "info",
    };
    const level = levelMap[statusLabel] || "info";
    // execution_logs.status check: only pending, running, completed, failed, skipped
    const statusMap = {
      success: "completed",
      error: "failed",
      warning: "failed",
      info: "completed",
    };
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
      const dropped = this._logBuffer.splice(
        0,
        this._logBuffer.length - this._LOG_MAX_BUFFER + 1,
      );
      console.warn(
        `[Supabase] Log buffer overflow — dropped ${dropped.length} oldest entries`,
      );
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
        console.error(
          `[Supabase] Batch log insert failed (${entries.length} entries): ${error.message}`,
        );
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
        const lines =
          entries
            .map(
              (e) =>
                `${new Date().toISOString()} [${e.level}] exec=${e.execution_id} device=${e.device_id || "-"} status=${e.status} ${e.message || ""}`,
            )
            .join("\n") + "\n";
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
      console.log(
        `[Supabase] Flushing ${this._logBuffer.length} remaining log entries...`,
      );
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
    console.log(
      `[Supabase] Subscribing to Broadcast room:tasks for PC ${pcId}`,
    );

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          status: this.broadcastStatus || "TIMEOUT",
          channel: this.broadcastSubscription,
        });
      }, timeoutMs);

      this.broadcastSubscription = this.supabase
        .channel("room:tasks")
        .on("broadcast", { event: "insert" }, ({ payload }) => {
          const task = payload?.record;
          if (!task) return;
          if (task.pc_id === pcId && task.status === "pending") {
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
            task.pc_id === pcId &&
            task.status === "pending" &&
            (!oldTask || oldTask.status !== "pending")
          ) {
            this.broadcastReceivedCount++;
            this.lastTaskReceivedAt = Date.now();
            this.lastTaskReceivedVia = "broadcast";
            console.log(
              `[Supabase] [Broadcast] 태스크 재배정 수신: ${task.id}`,
            );
            callback(task);
          }
        })
        .subscribe((status) => {
          this.broadcastStatus = status;
          console.log(`[Supabase] Broadcast room:tasks status: ${status}`);
          if (
            status === "SUBSCRIBED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            clearTimeout(timeout);
            resolve({ status, channel: this.broadcastSubscription });
          }
        });
    });
  }

  /**
   * Get pending task_queue rows for this PC (명세 4.4 보완 폴링용)
   * @param {string} pcNumber - e.g. "PC01"
   * @returns {Promise<Array>}
   */
  async getPendingTaskQueueItems(pcNumber) {
    const { data, error } = await this.supabase
      .from("task_queue")
      .select("*")
      .eq("target_worker", pcNumber)
      .eq("status", "queued")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true });

    if (error) {
      console.error(
        `[Supabase] getPendingTaskQueueItems failed: ${error.message}`,
      );
      return [];
    }
    return data || [];
  }

  /**
   * Create task from task_queue item and mark queue as dispatched (명세 4.4)
   * @param {object} item - task_queue row
   * @param {string} pcId - this PC UUID
   * @returns {Promise<object|null>} created task row or null
   */
  async createTaskFromQueueItem(item, pcId) {
    const taskConfig = item.task_config || {};
    const insertData = {
      video_id: taskConfig.videoId || taskConfig.video_id || null,
      channel_id: taskConfig.channelId || taskConfig.channel_id || null,
      type: taskConfig.type || "youtube",
      task_type: taskConfig.taskType || taskConfig.task_type || "view_farm",
      device_count: taskConfig.deviceCount || taskConfig.device_count || 20,
      payload: taskConfig.variables ||
        taskConfig.payload || {
          watchPercent: 80,
          commentProb: 10,
          likeProb: 40,
          saveProb: 5,
          subscribeToggle: false,
        },
      status: "pending",
      pc_id: pcId,
    };

    const { data: task, error: taskErr } = await this.supabase
      .from("tasks")
      .insert(insertData)
      .select("*")
      .single();

    if (taskErr) {
      console.error(
        `[Supabase] createTaskFromQueueItem insert failed: ${taskErr.message}`,
      );
      return null;
    }

    const { error: updateErr } = await this.supabase
      .from("task_queue")
      .update({
        status: "dispatched",
        dispatched_task_id: task.id,
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (updateErr) {
      console.error(
        `[Supabase] createTaskFromQueueItem queue update failed: ${updateErr.message}`,
      );
    }
    return task;
  }

  /**
   * Default workflow config for task_devices (matches lib/workflow-templates.ts structure).
   * @param {object} opts - { videoId?, videoUrl?, durationSec?, keyword? }
   * @returns {object}
   */
  _defaultWatchWorkflowConfig(opts = {}) {
    const durationSec = opts.durationSec ?? 60;
    return {
      workflow: {
        schemaVersion: 1,
        type: "view_farm",
        name: "default",
        steps: [
          { module: "search_video", waitSecAfter: 10, params: { keyword: opts.keyword } },
          { module: "watch_video", waitSecAfter: 60, params: { durationSec } },
          { module: "video_actions", waitSecAfter: 30 },
        ],
      },
      ...(opts.videoId && { video_id: opts.videoId }),
      ...(opts.videoUrl && { video_url: opts.videoUrl }),
      duration_sec: durationSec,
      actions: {
        policy: {
          probLike: 40,
          probComment: 10,
          probScrap: 5,
        },
      },
    };
  }

  /**
   * Fan-out: create task_devices rows for a task for all devices of a PC (runner will claim them).
   * @param {string} taskId - task UUID
   * @param {string} pcId - PC UUID
   * @param {{ taskConfig?: object, maxDevices?: number }} options
   * @returns {Promise<number>} number of task_devices inserted
   */
  async fanOutTaskDevicesForTask(taskId, pcId, options = {}) {
    const taskConfig = options.taskConfig || {};
    const maxDevices = options.maxDevices ?? 100;
    const { data: devices, error: devErr } = await this.supabase
      .from("devices")
      .select("id, serial")
      .eq("pc_id", pcId)
      .limit(maxDevices);

    if (devErr || !devices || devices.length === 0) {
      if (devErr) {
        console.error(`[Supabase] fanOutTaskDevicesForTask devices: ${devErr.message}`);
      }
      return 0;
    }

    const videoId = taskConfig.videoId || taskConfig.video_id;
    const videoUrl =
      taskConfig.videoUrl ||
      (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    const baseConfig = this._defaultWatchWorkflowConfig({
      videoId,
      videoUrl,
      durationSec: taskConfig.durationSec ?? taskConfig.duration_sec ?? 60,
      keyword: taskConfig.keyword,
    });

    const rows = devices.map((d) => ({
      task_id: taskId,
      pc_id: pcId,
      device_id: d.id,
      device_serial: d.serial,
      status: "queued",
      config: { ...baseConfig, video_id: videoId, video_url: videoUrl },
    }));

    const { data, error } = await this.supabase
      .from("task_devices")
      .upsert(rows, { onConflict: "task_id,device_id", ignoreDuplicates: true });

    if (error) {
      console.error(`[Supabase] fanOutTaskDevicesForTask insert failed: ${error.message}`);
      return 0;
    }
    return Array.isArray(data) ? data.length : rows.length;
  }

  /**
   * Absorb command into task + task_devices (USE_TASK_DEVICES_ENGINE path).
   * Creates one task (task_name manual_command, payload = original command) and fan-out task_devices.
   * @param {object} cmdRow - command row (id, target_worker?, payload?, device_serials?)
   * @param {string} pcId - this PC UUID
   * @returns {Promise<object|null>} created task or null
   */
  async createTaskAndTaskDevicesFromCommand(cmdRow, pcId) {
    const payload = cmdRow.payload || {};
    const deviceSerials = payload.device_serials || payload.deviceSerials;

    const taskInsert = {
      title: "manual_command",
      type: "youtube",
      task_type: "command",
      status: "pending",
      pc_id: pcId,
      payload: { _command: cmdRow, _commandId: cmdRow.id },
    };

    const { data: task, error: taskErr } = await this.supabase
      .from("tasks")
      .insert(taskInsert)
      .select("*")
      .single();

    if (taskErr) {
      console.error(
        `[Supabase] createTaskAndTaskDevicesFromCommand task insert failed: ${taskErr.message}`,
      );
      return null;
    }

    let deviceList;
    if (Array.isArray(deviceSerials) && deviceSerials.length > 0) {
      const { data: devs } = await this.supabase
        .from("devices")
        .select("id, serial")
        .eq("pc_id", pcId)
        .in("serial", deviceSerials);
      deviceList = devs || [];
    } else {
      const { data: devs } = await this.supabase
        .from("devices")
        .select("id, serial")
        .eq("pc_id", pcId)
        .limit(100);
      deviceList = devs || [];
    }

    if (deviceList.length === 0) {
      return task;
    }

    const baseConfig = this._defaultWatchWorkflowConfig({
      durationSec: 60,
    });
    const rows = deviceList.map((d) => ({
      task_id: task.id,
      pc_id: pcId,
      device_id: d.id,
      device_serial: d.serial,
      status: "queued",
      config: { ...baseConfig, _commandPayload: payload },
    }));

    const { error: tdErr } = await this.supabase
      .from("task_devices")
      .upsert(rows, { onConflict: "task_id,device_id", ignoreDuplicates: true });

    if (tdErr) {
      console.error(
        `[Supabase] createTaskAndTaskDevicesFromCommand task_devices failed: ${tdErr.message}`,
      );
    }
    return task;
  }

  /**
   * Subscribe to task_queue and commands (명세 4.4: Realtime 구독)
   * @param {string} pcNumber - e.g. "PC01"
   * @param {{ onTaskQueue: (row: object) => void, onCommand: (row: object) => void }} callbacks
   * @param {number} timeoutMs
   * @returns {Promise<{status: string, channel: object}>}
   */
  subscribeToTaskQueueAndCommands(pcNumber, callbacks, timeoutMs = 10000) {
    console.log(
      `[Supabase] Subscribing to task_queue + commands for ${pcNumber}`,
    );

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          status: this._workerChannelStatus || "TIMED_OUT",
          channel: this._workerChannel,
        });
      }, timeoutMs);

      this._workerChannel = this.supabase
        .channel(`worker-${pcNumber}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "task_queue",
            filter: `target_worker=eq.${pcNumber}`,
          },
          (payload) => {
            if (payload.new && payload.new.status === "queued") {
              console.log(`[Supabase] [task_queue] 수신: ${payload.new.id}`);
              callbacks.onTaskQueue(payload.new);
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "commands",
            filter: `target_worker=eq.${pcNumber}`,
          },
          (payload) => {
            if (payload.new && payload.new.status === "pending") {
              console.log(`[Supabase] [commands] 수신: ${payload.new.id}`);
              callbacks.onCommand(payload.new);
            }
          },
        )
        .subscribe((status) => {
          this._workerChannelStatus = status;
          console.log(`[Supabase] worker-${pcNumber} status: ${status}`);
          if (
            status === "SUBSCRIBED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            clearTimeout(timeout);
            resolve({ status, channel: this._workerChannel });
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
        resolve({
          status: this.pgChangesStatus || "TIMEOUT",
          channel: this.taskSubscription,
        });
      }, timeoutMs);

      this.taskSubscription = this.supabase
        .channel("tasks-realtime")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "tasks",
            filter: `pc_id=eq.${pcId}`,
          },
          (payload) => {
            this.pgChangesReceivedCount++;
            this.lastTaskReceivedAt = Date.now();
            this.lastTaskReceivedVia = "pg_changes";
            console.log(
              `[Supabase] [pg_changes] 태스크 수신: ${payload.new.id}`,
            );
            callback(payload.new);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tasks",
            filter: `pc_id=eq.${pcId}`,
          },
          (payload) => {
            if (
              payload.new.status === "pending" &&
              payload.old.status !== "pending"
            ) {
              this.pgChangesReceivedCount++;
              this.lastTaskReceivedAt = Date.now();
              this.lastTaskReceivedVia = "pg_changes";
              console.log(
                `[Supabase] [pg_changes] 태스크 재배정 수신: ${payload.new.id}`,
              );
              callback(payload.new);
            }
          },
        )
        .subscribe((status) => {
          this.pgChangesStatus = status;
          console.log(`[Supabase] postgres_changes status: ${status}`);
          if (
            status === "SUBSCRIBED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
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

    if (this._workerChannel) {
      await this.supabase.removeChannel(this._workerChannel);
      this._workerChannel = null;
      console.log("[Supabase] Unsubscribed from worker task_queue+commands");
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
