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
   * Run ADB shell command
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} command - ADB shell command
   */
  adbShell(devices, command) {
    return this.send({
      action: "adbShell",
      devices,
      data: [{ command }],
    });
  }

  /**
   * Send pointer/touch event
   * @param {string} devices - Comma-separated serials or "all"
   * @param {string} action - "tap", "swipe", etc.
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  pointerEvent(devices, action, x, y) {
    return this.send({
      action: "pointerEvent",
      devices,
      data: [{ action, x, y }],
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
      data: [{ text }],
    });
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
