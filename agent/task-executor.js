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
    const taskType = task.task_type || task.type;
    console.log(`[TaskExecutor] Executing task ${task.id} (${taskType})`);

    try {
      // 1. Mark as running
      await this.supabaseSync.updateTaskStatus(task.id, "running", null, null);

      // 2. Check Xiaowei connection
      if (!this.xiaowei.connected) {
        throw new Error("Xiaowei is not connected");
      }

      // 3. Determine target devices
      const devices = this._resolveDevices(task);

      // 4. Execute based on task type
      const result = await this._dispatch(taskType, task, devices);

      // 5. Log success
      await this.supabaseSync.insertTaskLog(
        task.id,
        devices,
        this.supabaseSync.workerId,
        taskType,
        task.payload,
        result,
        "success",
        "Task completed"
      );

      // 6. Mark completed
      await this.supabaseSync.updateTaskStatus(task.id, "completed", result, null);
      console.log(`[TaskExecutor] Task ${task.id} completed`);
    } catch (err) {
      console.error(`[TaskExecutor] Task ${task.id} failed: ${err.message}`);

      // Log failure
      await this.supabaseSync.insertTaskLog(
        task.id,
        task.target_devices ? task.target_devices.join(",") : "all",
        this.supabaseSync.workerId,
        taskType,
        task.payload,
        null,
        "error",
        err.message
      );

      // Mark failed and increment retry
      await this.supabaseSync.updateTaskStatus(task.id, "failed", null, err.message);
      await this.supabaseSync.incrementRetryCount(task.id);
    } finally {
      this.running.delete(task.id);
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
   * @returns {Promise<object>}
   */
  async _dispatch(taskType, task, devices) {
    const payload = task.payload || {};
    const options = {
      count: payload.count || 1,
      taskInterval: payload.taskInterval || [1000, 3000],
      deviceInterval: payload.deviceInterval || "500",
    };

    switch (taskType) {
      case "watch_video":
        return this._executeWatchVideo(devices, payload, options);

      case "subscribe":
        return this.xiaowei.actionCreate(
          devices,
          payload.actionName || "YouTube_구독",
          options
        );

      case "like":
        return this.xiaowei.actionCreate(
          devices,
          payload.actionName || "YouTube_좋아요",
          options
        );

      case "comment":
        return this._executeComment(devices, payload, options);

      case "custom":
        return this._executeCustom(devices, payload, options);

      case "action":
        // Generic action execution
        if (!payload.actionName) {
          throw new Error("actionName is required for action type");
        }
        return this.xiaowei.actionCreate(devices, payload.actionName, options);

      case "script":
        // Generic script execution
        if (!payload.scriptPath) {
          throw new Error("scriptPath is required for script type");
        }
        return this.xiaowei.autojsCreate(devices, payload.scriptPath, options);

      case "adb":
        if (!payload.command) {
          throw new Error("command is required for adb type");
        }
        return this.xiaowei.adbShell(devices, payload.command);

      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  async _executeWatchVideo(devices, payload, options) {
    // Prefer action if specified, otherwise use script
    if (payload.actionName) {
      return this.xiaowei.actionCreate(devices, payload.actionName, options);
    }

    const scriptName = payload.scriptPath || "youtube_watch.js";
    const scriptPath = this._resolveScriptPath(scriptName);
    return this.xiaowei.autojsCreate(devices, scriptPath, {
      ...options,
      taskInterval: payload.taskInterval || [2000, 5000],
      deviceInterval: payload.deviceInterval || "1000",
    });
  }

  async _executeComment(devices, payload, options) {
    if (payload.scriptPath) {
      const scriptPath = this._resolveScriptPath(payload.scriptPath);
      return this.xiaowei.autojsCreate(devices, scriptPath, options);
    }

    // Fallback: use action
    return this.xiaowei.actionCreate(
      devices,
      payload.actionName || "YouTube_댓글",
      options
    );
  }

  async _executeCustom(devices, payload, options) {
    if (!payload.scriptPath) {
      throw new Error("scriptPath is required for custom task type");
    }
    const scriptPath = this._resolveScriptPath(payload.scriptPath);
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
}

module.exports = TaskExecutor;
