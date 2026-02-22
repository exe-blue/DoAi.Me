/**
 * DoAi.Me - Device Watchdog
 * Detects and recovers from device-level failures during 24h operation.
 * Runs every 60 seconds to check device health and attempt recovery.
 */

class DeviceWatchdog {
  constructor(xiaowei, supabaseSync, config, broadcaster) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    this.config = config;
    this.broadcaster = broadcaster;
    this.checkInterval = null;
    this.CHECK_INTERVAL_MS = 60 * 1000; // 60 seconds
    this._errorCounts = new Map(); // serial -> consecutive error count
    this._recoveryAttempts = new Map(); // serial -> recovery attempt count
    this._dispatchPaused = false;
    this._dispatchPauseTimeout = null;
    this.RECOVERY_MAX_ATTEMPTS = 3;
    this.MASS_DROPOUT_THRESHOLD = 0.20; // 20%
    this.MASS_DROPOUT_PAUSE_MS = 2 * 60 * 1000; // 2 minutes
    this.BATCH_SIZE = 5;
    this.BATCH_DELAY_MS = 3000;
    this.ERROR_COUNT_TRIGGER = 3; // consecutive errors before recovery attempt
    this.LAST_SEEN_STALE_MS = 5 * 60 * 1000; // 5 minutes
    this._previousOnlineCount = null;
  }

  /**
   * Start the periodic device health check.
   */
  start() {
    this.checkInterval = setInterval(() => this._check(), this.CHECK_INTERVAL_MS);
    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
    console.log('[DeviceWatchdog] Started (60s interval)');
  }

  /**
   * Stop the watchdog and clean up timers.
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this._dispatchPauseTimeout) {
      clearTimeout(this._dispatchPauseTimeout);
      this._dispatchPauseTimeout = null;
    }
  }

  /**
   * Whether task dispatch is currently paused due to mass dropout.
   */
  get isDispatchPaused() {
    return this._dispatchPaused;
  }

  /**
   * Main check loop — runs every 60 seconds.
   */
  async _check() {
    if (!this.xiaowei.connected) return;

    const workerId = this.supabaseSync.workerId;
    if (!workerId) return;

    try {
      // 1. Get current device list from DB
      const { data: devices, error } = await this.supabaseSync.supabase
        .from('devices')
        .select('serial, status, last_seen')
        .eq('worker_id', workerId);

      if (error || !devices) {
        console.error(`[DeviceWatchdog] Failed to query devices: ${error?.message}`);
        return;
      }

      if (devices.length === 0) return;

      const now = Date.now();
      const onlineDevices = devices.filter(d => d.status === 'online' || d.status === 'busy');
      const errorDevices = devices.filter(d => d.status === 'error');
      const offlineDevices = devices.filter(d => d.status === 'offline');

      // 2. Check for mass dropout (>20% went offline in one cycle)
      if (this._previousOnlineCount !== null) {
        const currentOnline = onlineDevices.length;
        const dropped = this._previousOnlineCount - currentOnline;
        if (this._previousOnlineCount > 0 && dropped > 0) {
          const dropRate = dropped / this._previousOnlineCount;
          if (dropRate >= this.MASS_DROPOUT_THRESHOLD) {
            await this._handleMassDropout(dropped, this._previousOnlineCount);
          }
        }
      }
      this._previousOnlineCount = onlineDevices.length;

      // 3. For devices with status='error' — track consecutive errors and attempt recovery
      for (const device of errorDevices) {
        const count = (this._errorCounts.get(device.serial) || 0) + 1;
        this._errorCounts.set(device.serial, count);

        if (count >= this.ERROR_COUNT_TRIGGER) {
          await this._attemptRecovery(device.serial);
        }
      }

      // Clear error counts for devices that are no longer in error
      for (const [serial] of this._errorCounts) {
        const dev = devices.find(d => d.serial === serial);
        if (dev && dev.status !== 'error') {
          this._errorCounts.delete(serial);
          this._recoveryAttempts.delete(serial);
        }
      }

      // 4. For online devices with stale last_seen — check ping
      for (const device of onlineDevices) {
        if (!device.last_seen) continue;
        const lastSeen = new Date(device.last_seen).getTime();
        if ((now - lastSeen) > this.LAST_SEEN_STALE_MS) {
          await this._checkPing(device.serial);
        }
      }
    } catch (err) {
      console.error(`[DeviceWatchdog] Check error: ${err.message}`);
    }
  }

  /**
   * Attempt to recover a device via ping and reconnect.
   * @param {string} serial - Device serial
   */
  async _attemptRecovery(serial) {
    const attempts = this._recoveryAttempts.get(serial) || 0;
    if (attempts >= this.RECOVERY_MAX_ATTEMPTS) {
      await this._markDead(serial);
      return;
    }

    this._recoveryAttempts.set(serial, attempts + 1);

    // Try: adb shell echo ping
    try {
      const result = await this.xiaowei.adbShell(serial, 'echo ping');
      if (result && JSON.stringify(result).includes('ping')) {
        this._errorCounts.delete(serial);
        this._recoveryAttempts.delete(serial);
        console.log(`[DeviceWatchdog] ${serial} recovered via ping`);
        return;
      }
    } catch (e) { /* ignore ping failure */ }

    // Try: adb disconnect + reconnect
    try {
      await this.xiaowei.adbShell(serial, `adb disconnect ${serial}`);
      await new Promise(r => setTimeout(r, 2000));
      await this.xiaowei.adbShell(serial, `adb connect ${serial}`);
      console.log(`[DeviceWatchdog] ${serial} reconnect attempt ${attempts + 1}/${this.RECOVERY_MAX_ATTEMPTS}`);
    } catch (err) {
      console.error(`[DeviceWatchdog] Recovery failed for ${serial}: ${err.message}`);
    }
  }

  /**
   * Check if an online device with stale last_seen is actually alive.
   * @param {string} serial - Device serial
   */
  async _checkPing(serial) {
    try {
      const result = await this.xiaowei.adbShell(serial, 'echo ping');
      if (result && JSON.stringify(result).includes('ping')) {
        // Device is alive, heartbeat will update last_seen next cycle
        return;
      }
      // No valid response — increment error count
      const count = (this._errorCounts.get(serial) || 0) + 1;
      this._errorCounts.set(serial, count);
      console.warn(`[DeviceWatchdog] ${serial} stale and unresponsive (error count: ${count})`);
    } catch (e) {
      const count = (this._errorCounts.get(serial) || 0) + 1;
      this._errorCounts.set(serial, count);
      console.warn(`[DeviceWatchdog] ${serial} ping failed: ${e.message} (error count: ${count})`);
    }
  }

  /**
   * Mark a device as dead after exceeding max recovery attempts.
   * @param {string} serial - Device serial
   */
  async _markDead(serial) {
    console.error(`[DeviceWatchdog] ${serial} marked as DEAD after ${this.RECOVERY_MAX_ATTEMPTS} recovery attempts`);

    try {
      await this.supabaseSync.supabase
        .from('devices')
        .update({
          status: 'offline',
          last_seen: new Date().toISOString(),
        })
        .eq('serial', serial);
    } catch (err) {
      console.error(`[DeviceWatchdog] Failed to mark ${serial} as dead: ${err.message}`);
    }

    // Clean up tracking maps
    this._errorCounts.delete(serial);
    this._recoveryAttempts.delete(serial);

    await this._publishEvent('device_dead', { serial, reason: 'Max recovery attempts exceeded' });
  }

  /**
   * Handle mass dropout scenario (>20% devices offline in one cycle).
   * Pauses task dispatch and attempts batched recovery.
   * @param {number} offlineCount - Number of devices that went offline
   * @param {number} totalCount - Total previously-online device count
   */
  async _handleMassDropout(offlineCount, totalCount) {
    console.log(`[DeviceWatchdog] MASS DROPOUT: ${offlineCount}/${totalCount} devices offline`);
    this._dispatchPaused = true;

    // Publish critical event
    await this._publishEvent('mass_dropout', { offlineCount, totalCount });

    // Pause dispatch for 2 minutes
    if (this._dispatchPauseTimeout) {
      clearTimeout(this._dispatchPauseTimeout);
    }
    this._dispatchPauseTimeout = setTimeout(() => {
      this._dispatchPaused = false;
      this._dispatchPauseTimeout = null;
      console.log('[DeviceWatchdog] Dispatch resumed after mass dropout pause');
    }, this.MASS_DROPOUT_PAUSE_MS);

    // Batch recovery: get all offline devices, process in groups of BATCH_SIZE
    try {
      const workerId = this.supabaseSync.workerId;
      const { data: offlineDevices } = await this.supabaseSync.supabase
        .from('devices')
        .select('serial')
        .eq('worker_id', workerId)
        .eq('status', 'offline');

      if (!offlineDevices || offlineDevices.length === 0) return;

      for (let i = 0; i < offlineDevices.length; i += this.BATCH_SIZE) {
        const batch = offlineDevices.slice(i, i + this.BATCH_SIZE);
        for (const device of batch) {
          await this._attemptRecovery(device.serial);
        }
        // Wait between batches
        if (i + this.BATCH_SIZE < offlineDevices.length) {
          await new Promise(r => setTimeout(r, this.BATCH_DELAY_MS));
        }
      }
    } catch (err) {
      console.error(`[DeviceWatchdog] Batch recovery failed: ${err.message}`);
    }
  }

  /**
   * Publish a system event via Supabase Broadcast.
   * @param {string} type - Event type
   * @param {object} data - Event payload
   */
  async _publishEvent(type, data) {
    try {
      const channel = this.supabaseSync.supabase.channel('room:system');
      await channel.send({
        type: 'broadcast',
        event: 'event',
        payload: { type, data, timestamp: new Date().toISOString() },
      });
      this.supabaseSync.supabase.removeChannel(channel);
    } catch (err) {
      console.error(`[DeviceWatchdog] Failed to publish event: ${err.message}`);
    }
  }
}

module.exports = DeviceWatchdog;
