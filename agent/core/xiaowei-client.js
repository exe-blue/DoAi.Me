/**
 * DoAi.Me - Xiaowei WebSocket Client
 * Connects to Xiaowei automation tool via WebSocket
 * Provides API for device control and action execution
 */
const EventEmitter = require("events");
const WebSocket = require("ws");

function parseDeviceList(response) {
  if (!response) return [];
  if (Array.isArray(response)) {
    return response.map(d => ({
      serial: d.serial || d.id || d.deviceId || "",
      model: d.model || d.name || "",
      status: "online",
      battery: d.battery != null ? d.battery : null,
      ipIntranet: d.ip || d.ipIntranet || null,
    }));
  }
  const devices = response.data || response.devices || response.list;
  if (Array.isArray(devices)) {
    return devices.map(d => ({
      serial: d.serial || d.id || d.deviceId || "",
      model: d.model || d.name || "",
      status: "online",
      battery: d.battery != null ? d.battery : null,
      ipIntranet: d.ip || d.ipIntranet || null,
    }));
  }
  if (typeof response === "object") {
    const entries = Object.entries(response).filter(
      ([key]) => !["action", "status", "code", "msg"].includes(key)
    );
    return entries.map(([serial, info]) => ({
      serial,
      model: (info && info.model) || "",
      status: "online",
      battery: (info && info.battery) != null ? (info && info.battery) : null,
      ipIntranet: (info && info.ip) || null,
    }));
  }
  return [];
}

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
    /** @type {Array<{serial: string, model?: string, status?: string, battery?: number|null, ipIntranet?: string|null}>} */
    this.lastDevices = [];
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

  _nextClientRequestId() {
    this._clientRequestSeq += 1;
    return `req-${Date.now()}-${this._clientRequestSeq}`;
  }

  _normalizeDevices(devices) {
    if (!devices) return "all";
    if (Array.isArray(devices)) {
      return devices.map((d) => String(d).trim()).filter(Boolean).sort().join(",") || "all";
    }
    return String(devices)
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean)
      .sort()
      .join(",") || "all";
  }

  _extractResponseDevices(msg) {
    if (!msg || typeof msg !== "object") return "";
    const raw = msg.devices ?? (msg.data && msg.data.devices) ?? msg.device ?? (msg.data && msg.data.device);
    return this._normalizeDevices(raw || "");
  }

  _extractResponseAction(msg) {
    if (!msg || typeof msg !== "object") return "";
    return String(msg.action ?? (msg.data && msg.data.action) ?? "");
  }

  _extractResponseTimestamp(msg) {
    if (!msg || typeof msg !== "object") return Date.now();
    const candidates = [msg.timestamp, msg.ts, msg.time, msg.createdAt, msg.updatedAt, msg.date];
    for (const value of candidates) {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const parsed = Date.parse(value);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return Date.now();
  }

  _decorateMatchedResponse(msg, pending, matchType) {
    if (!msg || typeof msg !== "object") {
      return {
        value: msg,
        matchedClientRequestId: pending.clientRequestId,
        matchedInternalRequestId: pending.id,
        responseMatchType: matchType,
      };
    }
    return {
      ...msg,
      matchedClientRequestId: pending.clientRequestId,
      matchedInternalRequestId: pending.id,
      responseMatchType: matchType,
    };
  }

  _isFallbackCandidate(msg, pending) {
    const responseAction = this._extractResponseAction(msg);
    const responseDevices = this._extractResponseDevices(msg);
    const responseTs = this._extractResponseTimestamp(msg);

    if (!responseAction || !responseDevices) return false;
    if (responseAction !== pending.action) return false;
    if (responseDevices !== pending.devices) return false;
    if (Math.abs(responseTs - pending.sentAt) > this._fallbackMatchWindowMs) return false;
    return true;
  }

  _handleResponse(msg) {
    if (this._pendingRequests.size === 0) return;

    const echoedId = msg && typeof msg === "object" ? msg.clientRequestId : null;
    if (echoedId) {
      for (const [id, pending] of this._pendingRequests) {
        if (pending.clientRequestId === echoedId) {
          this._pendingRequests.delete(id);
          clearTimeout(pending.timer);
          pending.resolve(this._decorateMatchedResponse(msg, pending, "exact"));
          return;
        }
      }
    }

    const candidates = [];
    for (const [id, pending] of this._pendingRequests) {
      if (this._isFallbackCandidate(msg, pending)) {
        candidates.push([id, pending]);
      }
    }

    if (candidates.length === 1) {
      const [id, pending] = candidates[0];
      this._pendingRequests.delete(id);
      clearTimeout(pending.timer);
      pending.resolve(this._decorateMatchedResponse(msg, pending, "fallback"));
      return;
    }

    const reason = candidates.length > 1 ? "ambiguous" : "no_match";
    console.warn("[Xiaowei] response_unmatched", {
      reason,
      responseAction: this._extractResponseAction(msg),
      responseDevices: this._extractResponseDevices(msg),
      responseClientRequestId: echoedId || null,
      pendingRequestIds: candidates.map(([, pending]) => pending.clientRequestId),
    });
  }

  _serializationKeys(message) {
    if (!message || !message.action) return [];
    const policy = this._serializationOptions[message.action];
    if (!policy || !policy.enabled) return [];

    const normalizedDevices = this._normalizeDevices(message.devices);
    if (!policy.perDevice || normalizedDevices === "all") {
      return [`${message.action}:all`];
    }

    return normalizedDevices.split(",").map((serial) => `${message.action}:${serial}`);
  }

  _sendWithSerialization(message, sendFn) {
    const keys = this._serializationKeys(message);
    if (keys.length === 0) {
      return sendFn();
    }

    const tails = keys
      .map((key) => this._serializationChains.get(key))
      .filter(Boolean);
    const waitFor = Promise.all(tails);

    const runPromise = waitFor.then(() => sendFn());
    const chainPromise = runPromise.catch(() => null);
    for (const key of keys) {
      this._serializationChains.set(key, chainPromise);
    }

    return runPromise.finally(() => {
      for (const key of keys) {
        if (this._serializationChains.get(key) === chainPromise) {
          this._serializationChains.delete(key);
        }
      }
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

  _createRequestId() {
    this._requestId += 1;
    return `${Date.now()}-${this._requestId}`;
  }

  _extractRequestId(msg) {
    if (!msg || typeof msg !== "object") return null;
    return (
      msg.requestId ||
      (msg.data && msg.data.requestId) ||
      (msg.echo && msg.echo.requestId) ||
      null
    );
  }

  _isErrorResponse(msg) {
    if (!msg || typeof msg !== "object") return false;
    const status = typeof msg.status === "string" ? msg.status.toLowerCase() : "";
    if (["error", "failed", "fail"].includes(status)) return true;
    if (typeof msg.code === "number" && msg.code >= 400) return true;
    if (msg.success === false) return true;
    return false;
  }

  _buildResponseError(msg, fallbackAction) {
    const action = (msg && msg.action) || fallbackAction || "unknown";
    const detail =
      (msg && (msg.error || msg.msg || msg.message)) ||
      `Xiaowei request failed: ${action}`;
    return new Error(detail);
  }

  _resolvePending(requestId, msg) {
    const pending = this._pendingRequests.get(requestId);
    if (!pending) return false;
    this._pendingRequests.delete(requestId);
    clearTimeout(pending.timer);
    if (this._isErrorResponse(msg)) {
      pending.reject(this._buildResponseError(msg, pending.meta.action));
    } else {
      pending.resolve(msg);
    }
    return true;
  }

  _findFallbackPendingId(msg) {
    const entries = Array.from(this._pendingRequests.entries());
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0][0];

    const responseAction = msg && msg.action;
    const responseDevices = msg && msg.devices;

    const candidates = entries.filter(([, pending]) => {
      const actionMatches = !responseAction || pending.meta.action === responseAction;
      const deviceMatches = !responseDevices || pending.meta.devices === responseDevices;
      return actionMatches && deviceMatches;
    });

    if (candidates.length > 0) {
      return candidates
        .slice()
        .sort((a, b) => a[1].meta.sentAt - b[1].meta.sentAt)[0][0];
    }

    // Last-resort compatibility path for legacy servers without requestId echo.
    return entries[0][0];
  }

  _handleIncomingMessage(msg) {
    this.emit("response", msg);

    if (this._pendingRequests.size === 0) return;

    const requestId = this._extractRequestId(msg);
    if (requestId) {
      // If the server echoes requestId but we no longer track it, ignore instead of mismatching.
      this._resolvePending(requestId, msg);
      return;
    }

    const fallbackId = this._findFallbackPendingId(msg);
    if (!fallbackId) return;
    this._resolvePending(fallbackId, msg);
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

  /**
   * Send a message without waiting for response (fire-and-forget)
   */
  sendNoWait(message) {
    if (!this.connected || !this.ws) {
      throw new Error("Not connected to Xiaowei");
    }
    this.ws.send(JSON.stringify(message));
  }

  /** List connected devices; also sets this.lastDevices for consumers that need the parsed list */
  list() {
    return this.send({ action: "list" }).then((resp) => {
      this.lastDevices = parseDeviceList(resp);
      return resp;
    });
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
