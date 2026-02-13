/**
 * DoAi.Me - Task Execution Engine
 * Maps Supabase tasks to Xiaowei WebSocket commands
 */
const path = require("path");

class TaskExecutor {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {import('./supabase-sync')} supabaseSync
   * @param {object} config
   */
  constructor(xiaowei, supabaseSync, config) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    this.config = config;
    this.running = new Set();
    this.maxConcurrent = 20;

    // Execution stats for monitoring
    this.stats = { total: 0, succeeded: 0, failed: 0 };
  }

  /**
   * Execute a task
   * @param {object} task - Task row from Supabase
   */
  async execute(task) {
    if (this.running.size >= this.maxConcurrent) {
      console.log(
        `[TaskExecutor] Max concurrent tasks reached (${this.maxConcurrent}), skipping ${task.id}`
      );
      return;
    }

    if (this.running.has(task.id)) {
      return; // Already running
    }

    this.running.add(task.id);
    this.stats.total++;
    const taskType = task.task_type || task.type;
    const startTime = Date.now();

    console.log(`[TaskExecutor] ▶ ${task.id} (${taskType})`);

    try {
      // 1. Mark as running
      await this.supabaseSync.updateTaskStatus(task.id, "running", null, null);

      // 2. Check Xiaowei connection
      if (!this.xiaowei.connected) {
        throw new Error("Xiaowei is not connected");
      }

      // 3. Fetch per-device configs from task_devices (if batch task)
      const deviceConfigs = await this._fetchDeviceConfigs(task.id);

      // 4. Execute based on task type — _dispatch logs the specific Xiaowei command
      const devices = this._resolveDevices(task);
      const result = await this._dispatch(taskType, task, devices, deviceConfigs);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      // 5. Extract response summary for logging
      const summary = _extractResponseSummary(result);

      // 6. Log success
      await this.supabaseSync.insertTaskLog(
        task.id,
        devices,
        this.supabaseSync.workerId,
        taskType,
        task.payload,
        result,
        "success",
        `Task completed (${durationSec}s)${summary ? ` — ${summary}` : ""}`
      );

      // 7. Update video play_count if this was a batch task
      if (deviceConfigs.size > 0) {
        await this._updateVideoPlayCounts(deviceConfigs);
      }

      // 8. Mark completed
      await this.supabaseSync.updateTaskStatus(task.id, "completed", result, null);
      this.stats.succeeded++;
      console.log(`[TaskExecutor] ✓ ${task.id} completed (${durationSec}s)${summary ? ` — ${summary}` : ""}`);
    } catch (err) {
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
      this.stats.failed++;
      console.error(`[TaskExecutor] ✗ ${task.id} failed: ${err.message} (${durationSec}s)`);

      // Log failure
      await this.supabaseSync.insertTaskLog(
        task.id,
        task.target_devices ? task.target_devices.join(",") : "all",
        this.supabaseSync.workerId,
        taskType,
        task.payload,
        null,
        "error",
        `${err.message} (${durationSec}s)`
      );

      // Mark failed and increment retry
      await this.supabaseSync.updateTaskStatus(task.id, "failed", null, err.message);
      await this.supabaseSync.incrementRetryCount(task.id);
    } finally {
      this.running.delete(task.id);
    }
  }

  /**
   * Fetch per-device configs from task_devices table
   * @param {string} taskId
   * @returns {Promise<Map<string, {video_url: string, video_id: string}>>}
   */
  async _fetchDeviceConfigs(taskId) {
    const { data, error } = await this.supabaseSync.supabase
      .from("task_devices")
      .select("device_serial, config")
      .eq("task_id", taskId);

    if (error) {
      console.warn(`[TaskExecutor] Failed to fetch task_devices: ${error.message}`);
      return new Map();
    }

    if (!data || data.length === 0) {
      return new Map();
    }

    const configs = new Map();
    for (const row of data) {
      if (row.config && row.config.video_url && row.config.video_id) {
        configs.set(row.device_serial, row.config);
      }
    }

    console.log(`[TaskExecutor] Loaded ${configs.size} per-device configs`);
    return configs;
  }

  /**
   * Update video play counts after task completion
   * @param {Map<string, {video_url: string, video_id: string}>} deviceConfigs
   */
  async _updateVideoPlayCounts(deviceConfigs) {
    const videoIdCounts = new Map();
    for (const config of deviceConfigs.values()) {
      const count = videoIdCounts.get(config.video_id) ?? 0;
      videoIdCounts.set(config.video_id, count + 1);
    }

    for (const [videoId, count] of videoIdCounts) {
      const { error } = await this.supabaseSync.supabase
        .from("videos")
        .update({ play_count: this.supabaseSync.supabase.rpc("increment", { x: count }) })
        .eq("id", videoId);

      if (error) {
        console.warn(`[TaskExecutor] Failed to increment play_count for video ${videoId}: ${error.message}`);
      }
    }
  }

  /**
   * Resolve which devices to target
   * @param {object} task
   * @returns {string} comma-separated serials or "all"
   */
  _resolveDevices(task) {
    if (task.target_devices && task.target_devices.length > 0) {
      return task.target_devices.join(",");
    }
    return "all";
  }

  /**
   * Dispatch task to the correct Xiaowei API call
   * @param {string} taskType
   * @param {object} task
   * @param {string} devices
   * @param {Map<string, {video_url: string, video_id: string}>} deviceConfigs
   * @returns {Promise<object>}
   */
  async _dispatch(taskType, task, devices, deviceConfigs) {
    const payload = task.payload || {};
    const options = {
      count: payload.count || 1,
      taskInterval: payload.taskInterval || [1000, 3000],
      deviceInterval: payload.deviceInterval || "500",
    };

    switch (taskType) {
      case "watch_video":
      case "view_farm":
        return this._executeWatchVideo(devices, payload, options, deviceConfigs);

      case "subscribe": {
        const actionName = payload.actionName || "YouTube_구독";
        console.log(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, actionName, options);
      }

      case "like": {
        const actionName = payload.actionName || "YouTube_좋아요";
        console.log(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, actionName, options);
      }

      case "comment":
        return this._executeComment(devices, payload, options);

      case "custom":
        return this._executeCustom(devices, payload, options);

      case "action":
        if (!payload.actionName) {
          throw new Error("actionName is required for action type");
        }
        console.log(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
        return this.xiaowei.actionCreate(devices, payload.actionName, options);

      case "script":
        if (!payload.scriptPath) {
          throw new Error("scriptPath is required for script type");
        }
        console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
        return this.xiaowei.autojsCreate(devices, payload.scriptPath, options);

      case "adb":
        if (!payload.command) {
          throw new Error("command is required for adb type");
        }
        console.log(`[TaskExecutor]   Xiaowei adbShell: "${payload.command}" → ${devices}`);
        return this.xiaowei.adbShell(devices, payload.command);

      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  async _executeWatchVideo(devices, payload, options, deviceConfigs) {
    // If we have per-device configs (batch task), execute individually for each device
    if (deviceConfigs && deviceConfigs.size > 0) {
      console.log(`[TaskExecutor]   Batch execution: ${deviceConfigs.size} devices with individual videos`);
      const results = [];

      for (const [deviceSerial, config] of deviceConfigs) {
        const devicePayload = { ...payload, video_url: config.video_url };
        console.log(`[TaskExecutor]   Device ${deviceSerial} → ${config.video_url}`);

        if (payload.actionName) {
          const result = await this.xiaowei.actionCreate(deviceSerial, payload.actionName, options);
          results.push({ device: deviceSerial, result });
        } else {
          const scriptName = payload.scriptPath || "youtube_watch.js";
          const scriptPath = this._resolveScriptPath(scriptName);
          const result = await this.xiaowei.autojsCreate(deviceSerial, scriptPath, {
            ...options,
            taskInterval: payload.taskInterval || [2000, 5000],
            deviceInterval: payload.deviceInterval || "1000",
          });
          results.push({ device: deviceSerial, result });
        }
      }

      return { batch: true, results };
    }

    // Fall back to standard execution (all devices get same video)
    if (payload.actionName) {
      console.log(`[TaskExecutor]   Xiaowei actionCreate: ${payload.actionName} → ${devices}`);
      return this.xiaowei.actionCreate(devices, payload.actionName, options);
    }

    const scriptName = payload.scriptPath || "youtube_watch.js";
    const scriptPath = this._resolveScriptPath(scriptName);
    console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${scriptName} → ${devices}`);
    return this.xiaowei.autojsCreate(devices, scriptPath, {
      ...options,
      taskInterval: payload.taskInterval || [2000, 5000],
      deviceInterval: payload.deviceInterval || "1000",
    });
  }

  async _executeComment(devices, payload, options) {
    if (payload.scriptPath) {
      const scriptPath = this._resolveScriptPath(payload.scriptPath);
      console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
      return this.xiaowei.autojsCreate(devices, scriptPath, options);
    }

    const actionName = payload.actionName || "YouTube_댓글";
    console.log(`[TaskExecutor]   Xiaowei actionCreate: ${actionName} → ${devices}`);
    return this.xiaowei.actionCreate(devices, actionName, options);
  }

  async _executeCustom(devices, payload, options) {
    if (!payload.scriptPath) {
      throw new Error("scriptPath is required for custom task type");
    }
    const scriptPath = this._resolveScriptPath(payload.scriptPath);
    console.log(`[TaskExecutor]   Xiaowei autojsCreate: ${payload.scriptPath} → ${devices}`);
    return this.xiaowei.autojsCreate(devices, scriptPath, {
      ...options,
      taskInterval: payload.taskInterval || [2000, 5000],
      deviceInterval: payload.deviceInterval || "1000",
    });
  }

  /**
   * Resolve script path: if relative, prepend scriptsDir
   * @param {string} scriptPath
   * @returns {string} absolute path
   */
  _resolveScriptPath(scriptPath) {
    if (path.isAbsolute(scriptPath)) {
      return scriptPath;
    }
    if (this.config.scriptsDir) {
      return path.join(this.config.scriptsDir, scriptPath);
    }
    return scriptPath;
  }

  /** Get current running task count */
  get runningCount() {
    return this.running.size;
  }

  /** Get execution stats */
  getStats() {
    return { ...this.stats, running: this.running.size };
  }
}

/**
 * Extract a short summary from Xiaowei response for logging.
 * @param {object} result
 * @returns {string|null}
 */
function _extractResponseSummary(result) {
  if (!result) return null;
  if (typeof result === "string") return result.substring(0, 100);

  // Common Xiaowei response patterns
  if (result.msg) return String(result.msg).substring(0, 100);
  if (result.message) return String(result.message).substring(0, 100);
  if (result.status) return `status=${result.status}`;
  if (result.code !== undefined) return `code=${result.code}`;
  if (result.success !== undefined) return result.success ? "success=true" : "success=false";

  return null;
}

module.exports = TaskExecutor;
