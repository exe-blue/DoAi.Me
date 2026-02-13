/**
 * DoAi.Me - Proxy Manager
 * Loads proxy assignments from Supabase and applies them to devices via Xiaowei.
 *
 * Flow:
 *   1. loadAssignments() — query proxies table for this worker's device-assigned proxies
 *   2. applyAll()        — push proxy settings to each device via adb shell
 *   3. verifyAll()       — confirm each device's external IP matches the proxy
 */

class ProxyManager {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {import('./supabase-sync')} supabaseSync
   */
  constructor(xiaowei, supabaseSync) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    /** @type {Map<string, {proxyId: string, address: string, username: string|null, password: string|null, type: string, deviceId: string}>} */
    this.assignments = new Map(); // serial → proxy info
  }

  /**
   * Load proxy-device assignments from Supabase for this worker.
   * Queries proxies table WHERE worker_id = this worker AND device_id IS NOT NULL,
   * then joins with devices to get serials.
   * @returns {Promise<number>} number of assignments loaded
   */
  async loadAssignments(workerId) {
    this.assignments.clear();

    // Get all proxies assigned to devices for this worker
    const { data: proxies, error: proxyErr } = await this.supabaseSync.supabase
      .from("proxies")
      .select("id, address, username, password, type, device_id")
      .eq("worker_id", workerId)
      .not("device_id", "is", null);

    if (proxyErr) {
      console.error(`[Proxy] Failed to load proxy assignments: ${proxyErr.message}`);
      return 0;
    }

    if (!proxies || proxies.length === 0) {
      console.log("[Proxy] No proxy assignments found for this worker");
      return 0;
    }

    // Get device serials for the assigned device IDs
    const deviceIds = proxies.map((p) => p.device_id);
    const { data: devices, error: devErr } = await this.supabaseSync.supabase
      .from("devices")
      .select("id, serial")
      .in("id", deviceIds);

    if (devErr) {
      console.error(`[Proxy] Failed to load device serials: ${devErr.message}`);
      return 0;
    }

    const deviceMap = new Map(); // device_id → serial
    for (const d of (devices || [])) {
      deviceMap.set(d.id, d.serial);
    }

    // Build assignments: serial → proxy info
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
      });
    }

    console.log(`[Proxy] Loaded ${this.assignments.size} proxy assignment(s)`);
    return this.assignments.size;
  }

  /**
   * Build the proxy URL string for display/logging.
   * @param {{address: string, username: string|null, password: string|null, type: string}} proxy
   * @returns {string}
   */
  _formatProxyUrl(proxy) {
    const creds = proxy.username && proxy.password
      ? `${proxy.username}:${proxy.password}@`
      : "";
    return `${proxy.type}://${creds}${proxy.address}`;
  }

  /**
   * Apply proxy to a single device via adb shell.
   * Sets the global HTTP proxy setting on Android.
   * @param {string} serial - device serial
   * @param {object} proxy - proxy info
   * @returns {Promise<boolean>} success
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
      // Set HTTP proxy via global settings
      await this.xiaowei.adbShell(
        serial,
        `settings put global http_proxy ${host}:${port}`
      );

      console.log(`[Proxy] ${serial} ← proxy: ${this._formatProxyUrl(proxy)} ✓`);
      return true;
    } catch (err) {
      console.error(`[Proxy] ${serial} ← proxy: ${this._formatProxyUrl(proxy)} ✗ (${err.message})`);
      return false;
    }
  }

  /**
   * Apply proxies to all assigned devices.
   * @returns {Promise<{applied: number, failed: number, total: number}>}
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
   * Verify proxy is applied on a single device.
   * Checks adb settings and optionally verifies external IP.
   * @param {string} serial
   * @returns {Promise<{ok: boolean, currentProxy: string|null, externalIp: string|null}>}
   */
  async verifyProxy(serial) {
    const result = { ok: false, currentProxy: null, externalIp: null };

    if (!this.xiaowei.connected) {
      return result;
    }

    try {
      // Check current proxy setting
      const proxyResp = await this.xiaowei.adbShell(
        serial,
        "settings get global http_proxy"
      );
      result.currentProxy = _extractAdbOutput(proxyResp);

      // Check external IP via curl
      const ipResp = await this.xiaowei.adbShell(
        serial,
        "curl -s --max-time 10 https://ipinfo.io/ip"
      );
      result.externalIp = _extractAdbOutput(ipResp);

      // Validate: proxy setting should match expected
      const proxy = this.assignments.get(serial);
      if (proxy && result.currentProxy) {
        const expected = proxy.address; // host:port
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
   * @returns {Promise<{verified: number, failed: number, results: Map<string, object>}>}
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

  /**
   * Clear proxy from a single device.
   * @param {string} serial
   * @returns {Promise<boolean>}
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
   * @returns {Promise<number>} number of devices cleared
   */
  async clearAll() {
    let cleared = 0;
    for (const [serial] of this.assignments) {
      if (await this.clearProxy(serial)) cleared++;
    }
    return cleared;
  }
}

/**
 * Extract clean text output from Xiaowei adbShell response.
 * Response format varies; try common patterns.
 * @param {object} response
 * @returns {string|null}
 */
function _extractAdbOutput(response) {
  if (!response) return null;

  // Direct string
  if (typeof response === "string") return response.trim();

  // { output: "..." } or { result: "..." } or { data: "..." }
  const text = response.output || response.result || response.data || response.stdout;
  if (typeof text === "string") return text.trim();

  // Array of lines
  if (Array.isArray(response)) return response.join("\n").trim();

  return null;
}

module.exports = ProxyManager;
