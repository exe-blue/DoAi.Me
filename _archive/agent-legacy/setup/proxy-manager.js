/**
 * DoAi.Me - Proxy Manager
 * Loads proxy assignments from Supabase and applies them to devices via Xiaowei.
 * Supports failure detection, auto-rotation, and policy-based assignment.
 *
 * Flow:
 *   1. loadAssignments() — query proxies table for this worker's device-assigned proxies
 *   2. applyAll()        — push proxy settings to each device via adb shell
 *   3. verifyAll()       — confirm each device's external IP matches the proxy
 *   4. startCheckLoop()  — periodic proxy validation + failure detection
 *
 * Proxy policies:
 *   - sticky:             keep same proxy until manual change
 *   - rotate_on_failure:  auto-swap when fail_count >= 3
 *   - rotate_daily:       shuffle all proxy assignments once per day
 */

const FAIL_THRESHOLD = 3; // Mark proxy invalid after this many consecutive failures

class ProxyManager {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {import('./supabase-sync')} supabaseSync
   * @param {import('./config')} config
   * @param {import('./dashboard-broadcaster')|null} broadcaster
   */
  constructor(xiaowei, supabaseSync, config, broadcaster) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    this.config = config || {};
    this.broadcaster = broadcaster || null;

    /** @type {Map<string, {proxyId: string, address: string, username: string|null, password: string|null, type: string, deviceId: string}>} */
    this.assignments = new Map(); // serial → proxy info
    this._checkHandle = null;
    this._checkRunning = false;
    this._dailyRotateHandle = null;
  }

  // ─── Assignment loading ────────────────────────────────────────

  /**
   * Load proxy-device assignments from Supabase for this worker.
   * @param {string} workerId
   * @returns {Promise<number>} number of assignments loaded
   */
  async loadAssignments(workerId) {
    this.assignments.clear();

    let proxies;
    try {
      const { data, error: proxyErr } = await this.supabaseSync.supabase
        .from("proxies")
        .select("id, address, username, password, type, device_id, fail_count")
        .eq("pc_id", workerId)
        .not("device_id", "is", null);

      if (proxyErr) {
        console.warn(`[Proxy] proxies table not available — skipping (${proxyErr.message})`);
        return 0;
      }
      proxies = data;
    } catch (err) {
      console.warn(`[Proxy] proxies query failed — skipping (${err.message})`);
      return 0;
    }

    if (!proxies || proxies.length === 0) {
      console.log("[Proxy] No proxy assignments found for this worker");
      return 0;
    }

    const deviceIds = proxies.map((p) => p.device_id);
    const { data: devices, error: devErr } = await this.supabaseSync.supabase
      .from("devices")
      .select("id, serial")
      .in("id", deviceIds);

    if (devErr) {
      console.error(`[Proxy] Failed to load device serials: ${devErr.message}`);
      return 0;
    }

    const deviceMap = new Map();
    for (const d of devices || []) {
      deviceMap.set(d.id, d.serial);
    }

    for (const proxy of proxies) {
      const serial = deviceMap.get(proxy.device_id);
      if (!serial) {
        console.warn(`[Proxy] Device ${proxy.device_id} not found for proxy ${proxy.address}`);
        continue;
      }
      this.assignments.set(serial, {
        proxyId: proxy.id,
        address: proxy.address,
        username: proxy.username,
        password: proxy.password,
        type: proxy.type || "socks5",
        deviceId: proxy.device_id,
        failCount: proxy.fail_count || 0,
      });
    }

    console.log(`[Proxy] Loaded ${this.assignments.size} proxy assignment(s)`);
    return this.assignments.size;
  }

  // ─── Apply / Clear ─────────────────────────────────────────────

  /**
   * Build the proxy URL string for display/logging.
   */
  _formatProxyUrl(proxy) {
    const creds =
      proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : "";
    return `${proxy.type}://${creds}${proxy.address}`;
  }

  /**
   * Apply proxy to a single device via adb shell.
   * @param {string} serial
   * @param {object} proxy
   * @returns {Promise<boolean>}
   */
  async applyProxy(serial, proxy) {
    if (!this.xiaowei.connected) {
      console.error(`[Proxy] Cannot apply proxy to ${serial}: Xiaowei not connected`);
      return false;
    }

    const [host, port] = proxy.address.split(":");
    if (!host || !port) {
      console.error(`[Proxy] Invalid proxy address: ${proxy.address}`);
      return false;
    }

    try {
      await this.xiaowei.adbShell(serial, `settings put global http_proxy ${host}:${port}`);
      console.log(`[Proxy] ${serial} ← proxy: ${this._formatProxyUrl(proxy)} ✓`);
      return true;
    } catch (err) {
      console.error(`[Proxy] ${serial} ← proxy: ${this._formatProxyUrl(proxy)} ✗ (${err.message})`);
      return false;
    }
  }

  /**
   * Apply proxies to all assigned devices.
   */
  async applyAll() {
    if (this.assignments.size === 0) {
      console.log("[Proxy] No proxy assignments to apply");
      return { applied: 0, failed: 0, total: 0 };
    }

    let applied = 0;
    let failed = 0;

    for (const [serial, proxy] of this.assignments) {
      const ok = await this.applyProxy(serial, proxy);
      if (ok) applied++;
      else failed++;
    }

    console.log(`[Proxy] ${applied}/${this.assignments.size} 프록시 배정 완료`);
    if (failed > 0) {
      console.warn(`[Proxy] ${failed} device(s) failed proxy setup`);
    }

    return { applied, failed, total: this.assignments.size };
  }

  /**
   * Clear proxy from a single device.
   */
  async clearProxy(serial) {
    try {
      await this.xiaowei.adbShell(serial, "settings put global http_proxy :0");
      console.log(`[Proxy] ${serial} proxy cleared`);
      return true;
    } catch (err) {
      console.error(`[Proxy] Failed to clear proxy on ${serial}: ${err.message}`);
      return false;
    }
  }

  /**
   * Clear all proxies from assigned devices.
   */
  async clearAll() {
    let cleared = 0;
    for (const [serial] of this.assignments) {
      if (await this.clearProxy(serial)) cleared++;
    }
    return cleared;
  }

  // ─── Verification & Failure Detection ──────────────────────────

  /**
   * Verify proxy is applied on a single device and check external IP.
   * @param {string} serial
   * @returns {Promise<{ok: boolean, currentProxy: string|null, externalIp: string|null}>}
   */
  async verifyProxy(serial) {
    const result = { ok: false, currentProxy: null, externalIp: null };

    if (!this.xiaowei.connected) return result;

    try {
      const proxyResp = await this.xiaowei.adbShell(serial, "settings get global http_proxy");
      result.currentProxy = _extractAdbOutput(proxyResp);

      const ipResp = await this.xiaowei.adbShell(serial, "curl -s --max-time 10 https://ipinfo.io/ip");
      result.externalIp = _extractAdbOutput(ipResp);

      const proxy = this.assignments.get(serial);
      if (proxy && result.currentProxy) {
        const expected = proxy.address;
        result.ok = result.currentProxy.includes(expected);
      }

      return result;
    } catch (err) {
      console.error(`[Proxy] Verify failed for ${serial}: ${err.message}`);
      return result;
    }
  }

  /**
   * Verify all assigned proxies.
   */
  async verifyAll() {
    if (this.assignments.size === 0) {
      return { verified: 0, failed: 0, results: new Map() };
    }

    let verified = 0;
    let failed = 0;
    const results = new Map();

    for (const [serial, proxy] of this.assignments) {
      const result = await this.verifyProxy(serial);
      results.set(serial, result);

      if (result.ok) {
        console.log(`[IP Check] ${serial} → ${result.externalIp || "?"} (proxy: ${proxy.address}) ✓`);
        verified++;
      } else {
        console.warn(
          `[IP Check] ${serial} → ${result.externalIp || "?"} ` +
            `(expected proxy: ${proxy.address}, actual setting: ${result.currentProxy || "none"}) ✗`
        );
        failed++;
      }
    }

    if (verified === this.assignments.size) {
      console.log(`[IP Check] 각 디바이스 외부 IP가 프록시 IP와 일치 ✓`);
    }

    return { verified, failed, results };
  }

  // ─── Periodic Check Loop ───────────────────────────────────────

  /**
   * Start the periodic proxy check loop.
   * @param {string} workerId
   */
  startCheckLoop(workerId) {
    const interval = this.config.proxyCheckInterval || 300000;
    console.log(`[Proxy] Starting check loop (every ${interval / 1000}s, policy: ${this.config.proxyPolicy || "sticky"})`);

    this._checkHandle = setInterval(() => this._runCheckCycle(workerId), interval);

    // Start daily rotate timer if policy is rotate_daily
    if (this.config.proxyPolicy === "rotate_daily") {
      this._startDailyRotateTimer(workerId);
    }
  }

  /**
   * Stop the check loop.
   */
  stopCheckLoop() {
    if (this._checkHandle) {
      clearInterval(this._checkHandle);
      this._checkHandle = null;
    }
    if (this._dailyRotateHandle) {
      clearInterval(this._dailyRotateHandle);
      this._dailyRotateHandle = null;
    }
    console.log("[Proxy] Check loop stopped");
  }

  /**
   * Handle dynamic config change.
   * @param {string} key
   * @param {*} newValue
   */
  applyConfigChange(key, newValue) {
    const workerId = this.supabaseSync.pcUuid;

    if (key === "proxy_check_interval") {
      // Restart check loop with new interval
      if (this._checkHandle) {
        clearInterval(this._checkHandle);
        this._checkHandle = setInterval(() => this._runCheckCycle(workerId), newValue);
        console.log(`[Proxy] Check interval updated to ${newValue}ms`);
      }
    }

    if (key === "proxy_policy") {
      console.log(`[Proxy] Policy changed to: ${newValue}`);
      // Stop or start daily rotate timer based on new policy
      if (newValue === "rotate_daily") {
        this._startDailyRotateTimer(workerId);
      } else if (this._dailyRotateHandle) {
        clearInterval(this._dailyRotateHandle);
        this._dailyRotateHandle = null;
      }
    }
  }

  /**
   * One cycle of proxy validation + failure handling.
   * @param {string} workerId
   */
  async _runCheckCycle(workerId) {
    if (this._checkRunning) {
      console.log("[Proxy] Previous check cycle still running, skipping");
      return;
    }
    this._checkRunning = true;

    try {
      if (!this.xiaowei.connected) {
        console.log("[Proxy] Xiaowei offline, skipping proxy check");
        return;
      }

      // Reload assignments to pick up any external changes
      await this.loadAssignments(workerId);

      if (this.assignments.size === 0) return;

      const { results } = await this.verifyAll();

      // Process failures
      for (const [serial, verifyResult] of results) {
        const proxy = this.assignments.get(serial);
        if (!proxy) continue;

        if (!verifyResult.ok) {
          await this._handleProxyFailure(serial, proxy, workerId);
        } else {
          // Reset fail_count on success
          if (proxy.failCount > 0) {
            await this._resetFailCount(proxy.proxyId);
            proxy.failCount = 0;
          }
        }
      }
    } catch (err) {
      console.error(`[Proxy] Check cycle error: ${err.message}`);
    } finally {
      this._checkRunning = false;
    }
  }

  /**
   * Handle a proxy verification failure.
   * Increments fail_count, marks invalid at threshold, triggers auto-rotate.
   */
  async _handleProxyFailure(serial, proxy, workerId) {
    // Increment fail_count in DB
    const newFailCount = (proxy.failCount || 0) + 1;
    proxy.failCount = newFailCount;

    const { error } = await this.supabaseSync.supabase
      .from("proxies")
      .update({ fail_count: newFailCount })
      .eq("id", proxy.proxyId);

    if (error) {
      console.error(`[Proxy] Failed to update fail_count for ${proxy.address}: ${error.message}`);
    }

    console.warn(`[Proxy] ${serial} proxy fail_count: ${newFailCount}/${FAIL_THRESHOLD}`);

    // Mark invalid at threshold
    if (newFailCount >= FAIL_THRESHOLD) {
      await this.supabaseSync.supabase
        .from("proxies")
        .update({ status: "invalid" })
        .eq("id", proxy.proxyId);

      console.warn(`[Proxy] ${proxy.address} marked as INVALID (${newFailCount} failures)`);

      // Auto-rotate if policy allows
      if (this.config.proxyPolicy === "rotate_on_failure") {
        await this._autoRotateProxy(serial, proxy, workerId);
      }
    }
  }

  /**
   * Auto-rotate: find an unassigned valid proxy, swap it in for the failed one.
   */
  async _autoRotateProxy(serial, failedProxy, workerId) {
    // Find first unassigned valid proxy for this worker
    const { data: candidates, error: findErr } = await this.supabaseSync.supabase
      .from("proxies")
      .select("id, address, username, password, type")
      .eq("pc_id", workerId)
      .eq("status", "valid")
      .is("device_id", null)
      .limit(1);

    if (findErr || !candidates || candidates.length === 0) {
      console.warn(`[Proxy] No valid unassigned proxy available for auto-rotate on ${serial}`);
      if (this.broadcaster) {
        await this.broadcaster.publishSystemEvent("proxy_rotate_failed",
          `No valid proxy available for ${serial}`,
          { serial, failed_proxy: failedProxy.address });
      }
      return;
    }

    const newProxy = candidates[0];

    // Unassign old proxy
    await this.supabaseSync.supabase
      .from("proxies")
      .update({ device_id: null })
      .eq("id", failedProxy.proxyId);

    // Assign new proxy to the device
    await this.supabaseSync.supabase
      .from("proxies")
      .update({ device_id: failedProxy.deviceId, fail_count: 0 })
      .eq("id", newProxy.id);

    // Apply to device
    const applied = await this.applyProxy(serial, newProxy);

    // Update in-memory assignment
    this.assignments.set(serial, {
      proxyId: newProxy.id,
      address: newProxy.address,
      username: newProxy.username,
      password: newProxy.password,
      type: newProxy.type || "socks5",
      deviceId: failedProxy.deviceId,
      failCount: 0,
    });

    console.log(`[Proxy] Auto-rotated ${serial}: ${failedProxy.address} → ${newProxy.address} (applied: ${applied})`);

    if (this.broadcaster) {
      await this.broadcaster.publishSystemEvent("proxy_auto_rotated",
        `Proxy rotated on ${serial}: ${failedProxy.address} → ${newProxy.address}`,
        { serial, old_proxy: failedProxy.address, new_proxy: newProxy.address, applied });
    }
  }

  /**
   * Reset fail_count to 0 in DB.
   */
  async _resetFailCount(proxyId) {
    await this.supabaseSync.supabase
      .from("proxies")
      .update({ fail_count: 0 })
      .eq("id", proxyId);
  }

  // ─── Daily Rotation ────────────────────────────────────────────

  /**
   * Start a daily rotation timer (runs every 24h).
   */
  _startDailyRotateTimer(workerId) {
    if (this._dailyRotateHandle) {
      clearInterval(this._dailyRotateHandle);
    }

    const DAY_MS = 24 * 60 * 60 * 1000;
    console.log("[Proxy] Daily rotation timer started (every 24h)");

    this._dailyRotateHandle = setInterval(() => {
      this._rotateDailyAll(workerId).catch((err) => {
        console.error(`[Proxy] Daily rotation error: ${err.message}`);
      });
    }, DAY_MS);

    // Allow process to exit
    if (this._dailyRotateHandle.unref) {
      this._dailyRotateHandle.unref();
    }
  }

  /**
   * Shuffle all proxy assignments randomly for a worker.
   */
  async _rotateDailyAll(workerId) {
    console.log("[Proxy] Running daily proxy rotation...");

    // Get all valid proxies for this worker
    const { data: proxies, error: pErr } = await this.supabaseSync.supabase
      .from("proxies")
      .select("id, device_id")
      .eq("pc_id", workerId)
      .in("status", ["valid", "active"]);

    if (pErr || !proxies || proxies.length === 0) {
      console.warn("[Proxy] No proxies to rotate");
      return;
    }

    // Get all device IDs that currently have proxies
    const deviceIds = proxies.filter((p) => p.device_id).map((p) => p.device_id);
    const proxyIds = proxies.map((p) => p.id);

    // Unassign all
    await this.supabaseSync.supabase
      .from("proxies")
      .update({ device_id: null })
      .in("id", proxyIds);

    // Shuffle device IDs
    const shuffled = [...deviceIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Re-assign: pair proxies with shuffled device IDs
    let assigned = 0;
    for (let i = 0; i < Math.min(proxyIds.length, shuffled.length); i++) {
      await this.supabaseSync.supabase
        .from("proxies")
        .update({ device_id: shuffled[i], fail_count: 0 })
        .eq("id", proxyIds[i]);
      assigned++;
    }

    // Reload and apply
    await this.loadAssignments(workerId);
    const { applied } = await this.applyAll();

    console.log(`[Proxy] Daily rotation complete: ${assigned} reassigned, ${applied} applied`);

    if (this.broadcaster) {
      await this.broadcaster.publishSystemEvent("proxy_daily_rotation",
        `Daily proxy rotation: ${assigned} reassigned, ${applied} applied to devices`,
        { assigned, applied, total: proxyIds.length });
    }
  }
}

/**
 * Extract clean text output from Xiaowei adbShell response.
 */
function _extractAdbOutput(response) {
  if (!response) return null;
  if (typeof response === "string") return response.trim();
  const text = response.output || response.result || response.data || response.stdout;
  if (typeof text === "string") return text.trim();
  if (Array.isArray(response)) return response.join("\n").trim();
  return null;
}

module.exports = ProxyManager;
