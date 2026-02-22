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
    console.log(`[ADB Reconnect] Starting (every ${this.reconnectInterval / 1000}s)`);

    // Run immediately (unless already running), then on interval
    if (!this._reconnectRunning) {
      this.reconnectCycle();
    }
    this.reconnectHandle = setInterval(() => this.reconnectCycle(), this.reconnectInterval);
  }

  /**
   * Stop the reconnect monitoring loop
   */
  stop() {
    if (this.reconnectHandle) {
      clearInterval(this.reconnectHandle);
      this.reconnectHandle = null;
      console.log('[ADB Reconnect] Stopped');
    }
  }

  /**
   * Update the list of registered devices from heartbeat
   * @param {Array<{serial: string}>} devices
   */
  updateRegisteredDevices(devices) {
    this.registeredDevices = new Set(devices.map(d => d.serial).filter(Boolean));
  }

  /**
   * Main reconnect cycle - detect disconnected devices and reconnect
   */
  async reconnectCycle() {
    // Guard: skip if a previous cycle is still running
    if (this._reconnectRunning) {
      console.log('[ADB Reconnect] Previous cycle still running, skipping');
      return;
    }
    this._reconnectRunning = true;

    try {
      // Skip if Xiaowei is not connected
      if (!this.xiaowei.connected) {
        console.log('[ADB Reconnect] Xiaowei offline, skipping cycle');
        return;
      }

      // Get currently connected devices from Xiaowei
      const response = await this.xiaowei.list();
      const connectedDevices = this.parseDeviceList(response);
      const connectedSerials = new Set(connectedDevices.map(d => d.serial).filter(Boolean));

      // Find disconnected devices (registered but not connected)
      const disconnected = [...this.registeredDevices].filter(s => !connectedSerials.has(s));

      if (disconnected.length === 0) {
        console.log('[ADB Reconnect] All devices connected, nothing to do');
        return;
      }

      console.log(`[ADB Reconnect] Found ${disconnected.length} disconnected device(s)`);

      // Filter out dead devices
      const alive = disconnected.filter(serial => {
        const failure = this.deviceFailures.get(serial);
        return !failure || !failure.isDead;
      });

      const dead = disconnected.filter(serial => {
        const failure = this.deviceFailures.get(serial);
        return failure && failure.isDead;
      });

      if (dead.length > 0) {
        console.log(`[ADB Reconnect] Skipping ${dead.length} dead device(s): ${dead.join(', ')}`);
      }

      // Process alive devices in batches
      const statusChanges = [];
      for (let i = 0; i < alive.length; i += this.batchSize) {
        const batch = alive.slice(i, i + this.batchSize);
        console.log(`[ADB Reconnect] Processing batch ${Math.floor(i / this.batchSize) + 1}: ${batch.length} device(s)`);

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
        const recovered = statusChanges.filter(c => c.status === 'online').map(c => c.serial);
        const failed = statusChanges.filter(c => c.status === 'error').map(c => c.serial);
        const newlyDead = statusChanges.filter(c => c.isDead).map(c => c.serial);

        if (recovered.length > 0) {
          await this.broadcaster.publishSystemEvent('adb_reconnect_success',
            `${recovered.length} device(s) reconnected via ADB`,
            { serials: recovered, count: recovered.length });
        }
        if (failed.length > 0) {
          await this.broadcaster.publishSystemEvent('adb_reconnect_failed',
            `${failed.length} device(s) failed to reconnect`,
            { serials: failed, count: failed.length });
        }
        if (newlyDead.length > 0) {
          await this.broadcaster.publishSystemEvent('adb_device_dead',
            `${newlyDead.length} device(s) flagged as dead (${this.deadThreshold}+ failures)`,
            { serials: newlyDead, count: newlyDead.length });
        }
      }

    } catch (err) {
      console.error(`[ADB Reconnect] Cycle error: ${err.message}`);
    } finally {
      this._reconnectRunning = false;
    }
  }

  /**
   * Reconnect a single device with retries
   * @param {string} serial
   * @returns {Promise<{serial: string, status: string, isDead?: boolean}|null>}
   */
  async reconnectDevice(serial) {
    let success = false;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ADB Reconnect] ${serial} - attempt ${attempt}/${this.maxRetries}`);

        const result = await Promise.race([
          this.xiaowei.adb(serial, 'connect'),
          this.timeoutPromise(this.reconnectTimeout)
        ]);

        // Check if reconnect succeeded
        if (result && !result.error) {
          success = true;
          console.log(`[ADB Reconnect] ✓ ${serial} reconnected`);
          break;
        } else {
          console.log(`[ADB Reconnect] ✗ ${serial} attempt ${attempt} failed: ${result?.error || 'unknown error'}`);
        }
      } catch (err) {
        console.log(`[ADB Reconnect] ✗ ${serial} attempt ${attempt} error: ${err.message}`);
      }

      // Wait before retry (unless this is the last attempt)
      if (attempt < this.maxRetries) {
        await this.sleep(1000);
      }
    }

    // Update failure tracking
    if (success) {
      // Reset failure count on success
      this.deviceFailures.delete(serial);
      return { serial, status: 'online' };
    } else {
      // Increment failure count
      const failure = this.deviceFailures.get(serial) || { failures: 0, lastDisconnect: null, isDead: false };
      failure.failures++;
      failure.lastDisconnect = new Date().toISOString();

      // Check if device should be flagged as dead
      if (failure.failures >= this.deadThreshold && !failure.isDead) {
        failure.isDead = true;
        console.warn(`[ADB Reconnect] ${serial} flagged as DEAD (${failure.failures} consecutive failures)`);
        this.deviceFailures.set(serial, failure);
        return { serial, status: 'error', isDead: true };
      }

      this.deviceFailures.set(serial, failure);
      return { serial, status: 'error' };
    }
  }

  /**
   * Apply status changes to database
   * @param {Array<{serial: string, status: string}>} changes
   */
  async applyStatusChanges(changes) {
    if (changes.length === 0) return;

    const devices = changes.map(c => ({
      serial: c.serial,
      status: c.status,
    }));

    await this.supabaseSync.batchUpsertDevices(devices, this.supabaseSync.pcId);
    console.log(`[ADB Reconnect] Updated ${changes.length} device status(es) in DB`);
  }

  /**
   * Get devices that are not dead
   * @returns {Array<string>}
   */
  getHealthyDevices() {
    return [...this.registeredDevices].filter(serial => {
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

    if (Array.isArray(response)) {
      return response.map(d => ({ serial: d.serial || d.id || d.deviceId || '' }));
    }

    const devices = response.data || response.devices || response.list;
    if (Array.isArray(devices)) {
      return devices.map(d => ({ serial: d.serial || d.id || d.deviceId || '' }));
    }

    if (typeof response === 'object' && !Array.isArray(response)) {
      const entries = Object.entries(response).filter(
        ([key]) => !['action', 'status', 'code', 'msg'].includes(key)
      );
      if (entries.length > 0) {
        return entries.map(([serial]) => ({ serial }));
      }
    }

    return [];
  }

  /**
   * Sleep utility
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Timeout promise utility
   * @param {number} ms
   * @returns {Promise<never>}
   */
  timeoutPromise(ms) {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    );
  }
}

module.exports = AdbReconnectManager;
