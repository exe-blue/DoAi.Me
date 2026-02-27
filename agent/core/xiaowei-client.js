/**
 * DoAi.Me - Xiaowei WebSocket Client
 * Connects to Xiaowei automation tool via WebSocket
 * Provides API for device control and action execution
 */
const EventEmitter = require("events");
const WebSocket = require("ws");

class XiaoweiClient extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.wsUrl = wsUrl;
    this.ws = null;
    this.connected = false;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.shouldReconnect = true;
    this._pendingRequests = new Map();
    this._requestId = 0;
    this._commandQueue = [];
    this._maxQueueSize = 100;
    this._disconnectedAt = null;
  }

  get isConnected() {
    return this.connected;
  }

  get disconnectedDuration() {
    if (this._disconnectedAt) {
      return Date.now() - this._disconnectedAt;
    }
    return 0;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    console.log(`[Xiaowei] Connecting to ${this.wsUrl}...`);

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      console.error(`[Xiaowei] Connection error: ${err.message}`);
      this._scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      console.log("[Xiaowei] Connected");
      this.connected = true;
      this.reconnectDelay = 1000;

      // Check for extended disconnect (> 2 minutes)
      if (this._disconnectedAt) {
        const duration = Date.now() - this._disconnectedAt;
        if (duration > 2 * 60 * 1000) {
          console.log(`[Xiaowei] Extended disconnect detected: ${Math.round(duration / 1000)}s`);
          this.emit("extended-disconnect", { duration });
        }
        this._disconnectedAt = null;
      }

      this.emit("connected");

      // Flush queued commands
      if (this._commandQueue.length > 0) {
        this._flushQueue();
      }
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        this.emit("response", msg);

        // Resolve pending request if there's a matching one
        // Xiaowei may not echo requestId, so resolve the oldest pending
        if (this._pendingRequests.size > 0) {
          const [id, pending] = this._pendingRequests.entries().next().value;
          this._pendingRequests.delete(id);
          clearTimeout(pending.timer);
          pending.resolve(msg);
        }
      } catch (err) {
        console.error(`[Xiaowei] Failed to parse message: ${err.message}`);
      }
    });

    this.ws.on("close", () => {
      const wasConnected = this.connected;
      this.connected = false;
      if (wasConnected) {
        this._disconnectedAt = Date.now();
        console.log("[Xiaowei] Disconnected");
        this.emit("disconnected");
      }
      this._rejectAllPending("WebSocket disconnected");
      this._scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error(`[Xiaowei] WebSocket error: ${err.message}`);
      this.emit("error", err);
    });
  }

  _scheduleReconnect() {
    if (!this.shouldReconnect) return;

    console.log(
      `[Xiaowei] Reconnecting in ${this.reconnectDelay / 1000}s...`
    );
    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.maxReconnectDelay
    );
  }

  _rejectAllPending(reason) {
    for (const [id, pending] of this._pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this._pendingRequests.clear();
  }

  /**
   * Flush queued commands after reconnect.
   * Commands are sent raw — callers already received { queued: true }.
   */
  async _flushQueue() {
    const count = this._commandQueue.length;
    console.log(`[Xiaowei] Flushing ${count} queued command(s)`);
    while (this._commandQueue.length > 0) {
      const { message } = this._commandQueue.shift();
      try {
        if (this.ws && this.connected) {
          this.ws.send(JSON.stringify(message));
        }
      } catch (err) {
        console.error(`[Xiaowei] Failed to flush command: ${err.message}`);
      }
      // Small delay between commands to avoid flooding
      await new Promise((r) => setTimeout(r, 50));
    }
    if (count > 0) {
      console.log(`[Xiaowei] Queue flush complete`);
    }
  }

  /**
   * Send a JSON message and wait for response
   * @param {object} message - JSON message to send
   * @param {number} timeout - Response timeout in ms (default 30s)
   * @returns {Promise<object>}
   */
  send(message, timeout = 30000) {
    return new Promise((resolve, reject) => {
      if (!this.connected || !this.ws) {
        // Queue command instead of rejecting
        let dropped = 0;
        if (this._commandQueue.length >= this._maxQueueSize) {
          this._commandQueue.shift();
          dropped = 1;
        }
        this._commandQueue.push({ message });
        return resolve({ queued: true, dropped });
      }

      const id = ++this._requestId;
      const timer = setTimeout(() => {
        this._pendingRequests.delete(id);
        reject(new Error(`Xiaowei request timed out: ${message.action}`));
      }, timeout);

      this._pendingRequests.set(id, { resolve, reject, timer });

      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        this._pendingRequests.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  /**
   * Send a message without waiting for response (fire-and-forget)
   */
  sendNoWait(message) {
    if (!this.connected || !this.ws) {
      throw new Error("Not connected to Xiaowei");
    }
    this.ws.send(JSON.stringify(message));
  }

  /** List connected devices */
  list() {
    return this.send({ action: "list" });
  }

  /**
   * Execute a recorded Xiaowei action
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} actionName - Name of the recorded action
   * @param {object} options - count, taskInterval, deviceInterval
   */
  actionCreate(devices, actionName, options = {}) {
    return this.send({
      action: "actionCreate",
      devices,
      data: [
        {
          actionName,
          count: options.count || 1,
          taskInterval: options.taskInterval || [1000, 3000],
          deviceInterval: options.deviceInterval || "500",
        },
      ],
    });
  }

  /**
   * Run an AutoJS script
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} scriptPath - Full path to script file
   * @param {object} options - count, taskInterval, deviceInterval
   */
  autojsCreate(devices, scriptPath, options = {}) {
    return this.send({
      action: "autojsCreate",
      devices,
      data: [
        {
          path: scriptPath,
          count: options.count || 1,
          taskInterval: options.taskInterval || [2000, 5000],
          deviceInterval: options.deviceInterval || "1000",
        },
      ],
    });
  }

  /**
   * Run ADB shell command (without "adb" prefix)
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} command - Shell command (e.g. "getprop ro.product.model")
   */
  adbShell(devices, command) {
    return this.send({
      action: "adb_shell",
      devices,
      data: { command },
    });
  }

  /**
   * Run full ADB command (with "adb" prefix)
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} command - Full adb command
   */
  adb(devices, command) {
    return this.send({
      action: "adb",
      devices,
      data: { command },
    });
  }

  /**
   * Send pointer/touch event
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} type - "0"=press, "1"=release, "2"=move, "3"=scroll_up, "4"=scroll_down,
   *                         "5"=swipe_up, "6"=swipe_down, "7"=swipe_left, "8"=swipe_right
   * @param {string|number} x - X coordinate (0-100%)
   * @param {string|number} y - Y coordinate (0-100%)
   */
  pointerEvent(devices, type, x, y) {
    return this.send({
      action: "pointerEvent",
      devices,
      data: { type: String(type), x: String(x || "50"), y: String(y || "50") },
    });
  }

  /**
   * Input text on devices
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} text - Text to type
   */
  inputText(devices, text) {
    return this.send({
      action: "inputText",
      devices,
      data: { text },
    });
  }

  /**
   * Start an app by package name
   * @param {string} devices
   * @param {string} packageName - e.g. "com.google.android.youtube"
   */
  startApk(devices, packageName) {
    return this.send({
      action: "startApk",
      devices,
      data: { apk: packageName },
    });
  }

  /**
   * Stop an app by package name
   * @param {string} devices
   * @param {string} packageName
   */
  stopApk(devices, packageName) {
    return this.send({
      action: "stopApk",
      devices,
      data: { apk: packageName },
    });
  }

  /**
   * Install APK from file path
   * @param {string} devices
   * @param {string} filePath - Local path to APK file
   */
  installApk(devices, filePath) {
    return this.send({
      action: "installApk",
      devices,
      data: { path: filePath },
    });
  }

  /**
   * Uninstall an app
   * @param {string} devices
   * @param {string} packageName
   */
  uninstallApk(devices, packageName) {
    return this.send({
      action: "uninstallApk",
      devices,
      data: { apk: packageName },
    });
  }

  /**
   * Take a screenshot
   * @param {string} devices
   * @param {string} [savePath] - Optional path to save screenshot
   */
  screen(devices, savePath) {
    return this.send({
      action: "screen",
      devices,
      data: savePath ? { path: savePath } : {},
    });
  }

  /**
   * Navigation key event
   * @param {string} devices
   * @param {string} type - "0"=back, "1"=home, "2"=recents
   */
  pushEvent(devices, type) {
    return this.send({
      action: "pushEvent",
      devices,
      data: { type: String(type) },
    });
  }

  /**
   * Write text to clipboard
   * @param {string} devices
   * @param {string} text
   */
  writeClipBoard(devices, text) {
    return this.send({
      action: "writeClipBoard",
      devices,
      data: { text },
    });
  }

  /** Get list of installed apps */
  apkList(devices) {
    return this.send({
      action: "apkList",
      devices,
      data: {},
    });
  }

  /** Get list of input methods */
  imeList(devices) {
    return this.send({
      action: "imeList",
      devices,
      data: {},
    });
  }

  /** Update device information */
  updateDevices(devices, data) {
    return this.send({
      action: "updateDevices",
      devices,
      data,
    });
  }

  // ── Convenience methods ──

  goHome(devices) {
    return this.pushEvent(devices, "1");
  }

  goBack(devices) {
    return this.pushEvent(devices, "0");
  }

  recentApps(devices) {
    return this.pushEvent(devices, "2");
  }

  async tap(devices, x, y) {
    await this.pointerEvent(devices, "0", x, y);
    await new Promise((r) => setTimeout(r, 50));
    return this.pointerEvent(devices, "1", x, y);
  }

  swipeUp(devices) {
    return this.pointerEvent(devices, "5", "50", "50");
  }

  swipeDown(devices) {
    return this.pointerEvent(devices, "6", "50", "50");
  }

  /** Gracefully close the connection */
  disconnect() {
    this.shouldReconnect = false;
    this._rejectAllPending("Client disconnecting");
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    console.log("[Xiaowei] Client disconnected");
  }
}

module.exports = XiaoweiClient;
