/**
 * DoAi.Me - ADB TCP Reconnect Manager
 * Monitors and automatically reconnects disconnected ADB TCP devices
 * Tracks failure counts and flags persistently dead devices
 */

class AdbReconnectManager {
  constructor(xiaowei, supabaseSync, broadcaster, config) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    this.broadcaster = broadcaster;
    this.config = config;
    this.registeredDevices = new Set(); // serials known to exist
    this.deviceFailures = new Map(); // serial → {failures, lastDisconnect, isDead}
    this.reconnectHandle = null;
    this.reconnectInterval = 60000; // 60 seconds
    this.batchSize = 10; // Process 10 devices at a time
    this.batchGap = 1000; // 1 second between batches
    this.maxRetries = 2; // Max retries per device per cycle
    this.reconnectTimeout = 5000; // 5 second timeout per reconnect attempt
    this.deadThreshold = 10; // Flag as dead after 10 consecutive failures
    this._reconnectRunning = false; // Guard flag to prevent overlapping cycles
  }

  /**
   * Start the reconnect monitoring loop
   */
  start() {
    console.log(
      `[ADB Reconnect] Starting (every ${this.reconnectInterval / 1000}s)`,
    );

    // Run immediately (unless already running), then on interval
    if (!this._reconnectRunning) {
      this.reconnectCycle();
    }
    this.reconnectHandle = setInterval(
      () => this.reconnectCycle(),
      this.reconnectInterval,
    );
  }

  /**
   * Stop the reconnect monitoring loop
   */
  stop() {
    if (this.reconnectHandle) {
      clearInterval(this.reconnectHandle);
      this.reconnectHandle = null;
      console.log("[ADB Reconnect] Stopped");
    }
  }

  /**
   * Update the list of registered devices from heartbeat
   * @param {Array<{serial: string}>} devices
   */
  updateRegisteredDevices(devices) {
    // Use connectionId when present (e.g. IP:5555) so set matches Xiaowei list() output
    this.registeredDevices = new Set(
      devices.map((d) => d.connectionId || d.serial).filter(Boolean),
    );
  }

  /**
   * Main reconnect cycle - detect disconnected devices and reconnect
   */
  async reconnectCycle() {
    // Guard: skip if a previous cycle is still running
    if (this._reconnectRunning) {
      console.log("[ADB Reconnect] Previous cycle still running, skipping");
      return;
    }
    this._reconnectRunning = true;

    try {
      // Skip if Xiaowei is not connected
      if (!this.xiaowei.connected) {
        console.log("[ADB Reconnect] Xiaowei offline, skipping cycle");
        return;
      }

      // Get currently connected devices from Xiaowei
      const response = await this.xiaowei.list();
      const connectedDevices = this.parseDeviceList(response);
      const connectedSerials = new Set(
        connectedDevices.map((d) => d.serial).filter(Boolean),
      );

      // Find disconnected devices (registered but not connected)
      const disconnected = [...this.registeredDevices].filter(
        (s) => !connectedSerials.has(s),
      );

      if (disconnected.length === 0) {
        console.log("[ADB Reconnect] All devices connected, nothing to do");
        return;
      }

      console.log(
        `[ADB Reconnect] Found ${disconnected.length} disconnected device(s)`,
      );

      // Filter out dead devices
      const alive = disconnected.filter((serial) => {
        const failure = this.deviceFailures.get(serial);
        return !failure || !failure.isDead;
      });

      const dead = disconnected.filter((serial) => {
        const failure = this.deviceFailures.get(serial);
        return failure && failure.isDead;
      });

      if (dead.length > 0) {
        console.log(
          `[ADB Reconnect] Skipping ${dead.length} dead device(s): ${dead.join(", ")}`,
        );
      }

      // Process alive devices in batches
      const statusChanges = [];
      for (let i = 0; i < alive.length; i += this.batchSize) {
        const batch = alive.slice(i, i + this.batchSize);
        console.log(
          `[ADB Reconnect] Processing batch ${Math.floor(i / this.batchSize) + 1}: ${batch.length} device(s)`,
        );

        for (const serial of batch) {
          const result = await this.reconnectDevice(serial);
          if (result) {
            statusChanges.push(result);
          }
        }

        // Gap between batches (unless this is the last batch)
        if (i + this.batchSize < alive.length) {
          await this.sleep(this.batchGap);
        }
      }

      // Batch upsert status changes to DB
      if (statusChanges.length > 0) {
        await this.applyStatusChanges(statusChanges);
      }

      // Publish system events
      if (this.broadcaster) {
        const recovered = statusChanges
          .filter((c) => c.status === "online")
          .map((c) => c.serial);
        const failed = statusChanges
          .filter((c) => c.status === "error")
          .map((c) => c.serial);
        const newlyDead = statusChanges
          .filter((c) => c.isDead)
          .map((c) => c.serial);

        if (recovered.length > 0) {
          await this.broadcaster.publishSystemEvent(
            "adb_reconnect_success",
            `${recovered.length} device(s) reconnected via ADB`,
            { serials: recovered, count: recovered.length },
          );
        }
        if (failed.length > 0) {
          await this.broadcaster.publishSystemEvent(
            "adb_reconnect_failed",
            `${failed.length} device(s) failed to reconnect`,
            { serials: failed, count: failed.length },
          );
        }
        if (newlyDead.length > 0) {
          await this.broadcaster.publishSystemEvent(
            "adb_device_dead",
            `${newlyDead.length} device(s) flagged as dead (${this.deadThreshold}+ failures)`,
            { serials: newlyDead, count: newlyDead.length },
          );
        }
      }
    } catch (err) {
      console.error(`[ADB Reconnect] Cycle error: ${err.message}`);
    } finally {
      this._reconnectRunning = false;
    }
  }

  /**
   * Reconnect a single device with retries.
   * OTG(IP:5555) 방식: IP 주소가 있으면 `adb connect IP:5555`로 재연결 시도.
   * @param {string} serial
   * @returns {Promise<{serial: string, status: string, isDead?: boolean}|null>}
   */
  async reconnectDevice(serial) {
    let success = false;

    // IP:PORT 형식이면 시리얼에서 직접 추출 (TCP/IP 연결 기기)
    let ip = null;
    if (serial && /^[^:]+:\d+$/.test(serial)) {
      const idx = serial.lastIndexOf(":");
      ip = serial.substring(0, idx);
    }
    if (!ip) ip = await this._getDeviceIp(serial);

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(
          `[ADB Reconnect] ${serial} - attempt ${attempt}/${this.maxRetries}${ip ? ` (IP: ${ip})` : ""}`,
        );

        // 방법 1: IP:5555로 adb connect (OTG 네트워크 방식)
        if (ip) {
          try {
            const connectResult = await Promise.race([
              this.xiaowei.adbShell(serial, `connect ${ip}:5555`),
              this.timeoutPromise(this.reconnectTimeout),
            ]);
            const connectOut = this._extractOutput(connectResult);
            if (
              connectOut &&
              (connectOut.includes("connected") ||
                connectOut.includes("already"))
            ) {
              success = true;
              console.log(
                `[ADB Reconnect] ✓ ${serial} reconnected via IP ${ip}:5555`,
              );
              break;
            }
          } catch {}
        }

        // 방법 2: Xiaowei adb connect (기본)
        const result = await Promise.race([
          this.xiaowei.adb(serial, "connect"),
          this.timeoutPromise(this.reconnectTimeout),
        ]);

        if (result && !result.error) {
          success = true;
          console.log(`[ADB Reconnect] ✓ ${serial} reconnected`);
          break;
        } else {
          console.log(
            `[ADB Reconnect] ✗ ${serial} attempt ${attempt} failed: ${result?.error || "unknown error"}`,
          );
        }
      } catch (err) {
        console.log(
          `[ADB Reconnect] ✗ ${serial} attempt ${attempt} error: ${err.message}`,
        );
      }

      if (attempt < this.maxRetries) {
        await this.sleep(1000);
      }
    }

    // Update failure tracking
    if (success) {
      // Reset failure count on success
      this.deviceFailures.delete(serial);
      return { serial, status: "online" };
    } else {
      // Increment failure count
      const failure = this.deviceFailures.get(serial) || {
        failures: 0,
        lastDisconnect: null,
        isDead: false,
      };
      failure.failures++;
      failure.lastDisconnect = new Date().toISOString();

      // Check if device should be flagged as dead
      if (failure.failures >= this.deadThreshold && !failure.isDead) {
        failure.isDead = true;
        console.warn(
          `[ADB Reconnect] ${serial} flagged as DEAD (${failure.failures} consecutive failures)`,
        );
        this.deviceFailures.set(serial, failure);
        return { serial, status: "error", isDead: true };
      }

      this.deviceFailures.set(serial, failure);
      return { serial, status: "error" };
    }
  }

  /**
   * Resolve connection id (e.g. IP:5555) to DB serial for upsert.
   * When serial is IP:PORT we look up device by ip_intranet so we update the correct row.
   * @param {string} connectionIdOrSerial
   * @returns {Promise<string>} serial to use for batchUpsertDevices
   */
  async _resolveSerialForUpsert(connectionIdOrSerial) {
    if (!connectionIdOrSerial) return connectionIdOrSerial;
    if (!/^[^:]+:\d+$/.test(connectionIdOrSerial)) return connectionIdOrSerial;
    const ip = connectionIdOrSerial.substring(
      0,
      connectionIdOrSerial.lastIndexOf(":"),
    );
    try {
      const { data } = await this.supabaseSync.supabase
        .from("devices")
        .select("serial, connection_id")
        .eq("ip_intranet", ip)
        .eq("pc_id", this.supabaseSync.pcUuid)
        .limit(1)
        .maybeSingle();
      const canonical =
        data?.connection_id ?? data?.serial ?? connectionIdOrSerial;
      return canonical;
    } catch {
      return connectionIdOrSerial;
    }
  }

  /**
   * Apply status changes to database
   * @param {Array<{serial: string, status: string}>} changes
   */
  async applyStatusChanges(changes) {
    if (changes.length === 0) return;

    const devices = await Promise.all(
      changes.map(async (c) => ({
        serial: await this._resolveSerialForUpsert(c.serial),
        status: c.status,
      })),
    );

    await this.supabaseSync.batchUpsertDevices(devices, this.supabaseSync.pcNumber);
    console.log(
      `[ADB Reconnect] Updated ${changes.length} device status(es) in DB`,
    );
  }

  /**
   * Get devices that are not dead
   * @returns {Array<string>}
   */
  getHealthyDevices() {
    return [...this.registeredDevices].filter((serial) => {
      const failure = this.deviceFailures.get(serial);
      return !failure || !failure.isDead;
    });
  }

  /**
   * Reset a dead device's failure counter (manual recovery)
   * @param {string} serial
   */
  resetDevice(serial) {
    if (this.deviceFailures.has(serial)) {
      this.deviceFailures.delete(serial);
      console.log(`[ADB Reconnect] Reset failure counter for ${serial}`);
      return true;
    }
    return false;
  }

  /**
   * Get failure stats for diagnostics
   * @returns {Array<{serial: string, failures: number, lastDisconnect: string, isDead: boolean}>}
   */
  getFailureStats() {
    return [...this.deviceFailures.entries()].map(([serial, failure]) => ({
      serial,
      failures: failure.failures,
      lastDisconnect: failure.lastDisconnect,
      isDead: failure.isDead,
    }));
  }

  /**
   * Parse device list from Xiaowei response
   * @param {object} response
   * @returns {Array<{serial: string}>}
   */
  parseDeviceList(response) {
    if (!response) return [];

    const toSerial = (d) =>
      (d && (d.onlySerial || d.serial || d.id || d.deviceId)) || "";

    if (Array.isArray(response)) {
      return response.map((d) => ({ serial: toSerial(d) }));
    }

    const devices = response.data || response.devices || response.list;
    if (Array.isArray(devices)) {
      return devices.map((d) => ({ serial: toSerial(d) }));
    }

    if (typeof response === "object" && !Array.isArray(response)) {
      const entries = Object.entries(response).filter(
        ([key]) => !["action", "status", "code", "msg"].includes(key),
      );
      if (entries.length > 0) {
        return entries.map(([serial]) => ({ serial }));
      }
    }

    return [];
  }

  /**
   * DB에서 기기 IP 주소 조회 (ip_intranet)
   * @param {string} serial
   * @returns {Promise<string|null>}
   */
  async _getDeviceIp(serial) {
    try {
      const { data } = await this.supabaseSync.supabase
        .from("devices")
        .select("ip_intranet")
        .eq("serial", serial)
        .maybeSingle();
      return data?.ip_intranet || null;
    } catch {
      return null;
    }
  }

  /**
   * Xiaowei 응답에서 텍스트 출력 추출
   * @param {object} res
   * @returns {string}
   */
  _extractOutput(res) {
    if (!res) return "";
    if (typeof res === "string") return res;
    if (res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
      const vals = Object.values(res.data);
      if (vals.length > 0 && typeof vals[0] === "string") return vals[0];
    }
    if (res.msg) return String(res.msg);
    return "";
  }

  /**
   * Sleep utility
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Timeout promise utility
   * @param {number} ms
   * @returns {Promise<never>}
   */
  timeoutPromise(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), ms),
    );
  }
}

module.exports = AdbReconnectManager;
