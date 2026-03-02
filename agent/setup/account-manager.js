/**
 * DoAi.Me - Account Manager
 * Loads account-device assignments from Supabase and verifies YouTube login status.
 *
 * Flow:
 *   1. loadAssignments() — query accounts table for this worker's device-assigned accounts
 *   2. verifyAll()       — check YouTube/Google login on each device via adb
 *   3. updateLoginStatus() — update DB with verification results
 */

class AccountManager {
  /**
   * @param {import('./xiaowei-client')} xiaowei
   * @param {import('./supabase-sync')} supabaseSync
   */
  constructor(xiaowei, supabaseSync) {
    this.xiaowei = xiaowei;
    this.supabaseSync = supabaseSync;
    /** @type {Map<string, {accountId: string, email: string, status: string, deviceId: string}>} */
    this.assignments = new Map(); // serial → account info
  }

  /**
   * Load account-device assignments from Supabase for this worker.
   * @param {string} workerId
   * @returns {Promise<number>} number of assignments loaded
   */
  async loadAssignments(workerId) {
    this.assignments.clear();

    let accounts;
    try {
      const { data, error: accErr } = await this.supabaseSync.supabase
        .from("accounts")
        .select("id, email, status, device_id")
        .eq("pc_id", workerId)
        .not("device_id", "is", null);

      if (accErr) {
        console.warn(`[Account] accounts table not available — skipping (${accErr.message})`);
        return 0;
      }
      accounts = data;
    } catch (err) {
      console.warn(`[Account] accounts query failed — skipping (${err.message})`);
      return 0;
    }

    if (!accounts || accounts.length === 0) {
      console.log("[Account] No account assignments found for this worker");
      return 0;
    }

    // Get device serials for the assigned device IDs
    const deviceIds = accounts.map((a) => a.device_id);
    const { data: devices, error: devErr } = await this.supabaseSync.supabase
      .from("devices")
      .select("id, serial")
      .in("id", deviceIds);

    if (devErr) {
      console.error(`[Account] Failed to load device serials: ${devErr.message}`);
      return 0;
    }

    const deviceMap = new Map();
    for (const d of (devices || [])) {
      deviceMap.set(d.id, d.serial);
    }

    for (const account of accounts) {
      const serial = deviceMap.get(account.device_id);
      if (!serial) {
        console.warn(`[Account] Device ${account.device_id} not found for account ${account.email}`);
        continue;
      }
      this.assignments.set(serial, {
        accountId: account.id,
        email: account.email,
        status: account.status || "available",
        deviceId: account.device_id,
      });
    }

    console.log(`[Account] Loaded ${this.assignments.size} account assignment(s)`);
    return this.assignments.size;
  }

  /**
   * Verify YouTube/Google login status on a single device.
   * Uses `dumpsys account` to check for Google accounts on the device.
   * @param {string} serial
   * @returns {Promise<{loggedIn: boolean, googleEmail: string|null}>}
   */
  async verifyLogin(serial) {
    const result = { loggedIn: false, googleEmail: null };

    if (!this.xiaowei.connected) return result;

    try {
      // Check Google accounts registered on the device
      const resp = await this.xiaowei.adbShell(
        serial,
        "dumpsys account | grep -A1 'Account {' | grep -i com.google"
      );
      const output = _extractAdbOutput(resp);

      if (output) {
        // Extract email from output like: "Account {name=user@gmail.com, type=com.google}"
        const emailMatch = output.match(/name=([^\s,}]+@[^\s,}]+)/);
        if (emailMatch) {
          result.googleEmail = emailMatch[1];
          result.loggedIn = true;
        }
      }

      // Fallback: check if YouTube app has stored data (signed-in indicator)
      if (!result.loggedIn) {
        const ytResp = await this.xiaowei.adbShell(
          serial,
          "pm list packages | grep com.google.android.youtube"
        );
        const ytOutput = _extractAdbOutput(ytResp);
        if (ytOutput && ytOutput.includes("com.google.android.youtube")) {
          // YouTube is installed; check for sign-in via shared_prefs
          const prefResp = await this.xiaowei.adbShell(
            serial,
            "ls /data/data/com.google.android.youtube/shared_prefs/ 2>/dev/null | head -5"
          );
          const prefOutput = _extractAdbOutput(prefResp);
          // If there are account-related prefs, user is likely logged in
          if (prefOutput && prefOutput.includes("auth")) {
            result.loggedIn = true;
          }
        }
      }

      return result;
    } catch (err) {
      console.error(`[Account] Login check failed for ${serial}: ${err.message}`);
      return result;
    }
  }

  /**
   * Verify all assigned accounts and report status.
   * @returns {Promise<{verified: number, failed: number, total: number}>}
   */
  async verifyAll() {
    if (this.assignments.size === 0) {
      console.log("[Account] No account assignments to verify");
      return { verified: 0, failed: 0, total: 0 };
    }

    let verified = 0;
    let failed = 0;

    for (const [serial, account] of this.assignments) {
      const result = await this.verifyLogin(serial);

      if (result.loggedIn) {
        const emailMatch = result.googleEmail && account.email &&
          result.googleEmail.toLowerCase() === account.email.toLowerCase();

        if (emailMatch) {
          console.log(`[Account] ${serial} ← ${account.email} (YouTube 로그인 OK) ✓`);
        } else if (result.googleEmail) {
          console.warn(
            `[Account] ${serial} ← ${account.email} (다른 계정 로그인: ${result.googleEmail}) ⚠`
          );
        } else {
          console.log(`[Account] ${serial} ← ${account.email} (Google 로그인 감지) ✓`);
        }
        verified++;

        // Update account status to in_use if currently available
        if (account.status === "available") {
          await this._updateAccountStatus(account.accountId, "in_use");
        }
        // Update last_login
        await this._updateLastLogin(account.accountId);
      } else {
        console.warn(`[Account] ${serial} ← ${account.email} (YouTube 로그인 안됨) ✗`);
        failed++;
      }
    }

    console.log(`[Account] ${verified}/${this.assignments.size} 계정 로그인 확인 완료`);
    if (failed > 0) {
      console.warn(`[Account] ${failed} device(s) need YouTube login`);
    }

    return { verified, failed, total: this.assignments.size };
  }

  /**
   * Update account status in DB.
   * @param {string} accountId
   * @param {string} status - available | in_use | cooldown | banned | retired
   */
  async _updateAccountStatus(accountId, status) {
    const { error } = await this.supabaseSync.supabase
      .from("accounts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", accountId);

    if (error) {
      console.error(`[Account] Failed to update status for ${accountId}: ${error.message}`);
    }
  }

  /**
   * Update last_login timestamp.
   * @param {string} accountId
   */
  async _updateLastLogin(accountId) {
    const { error } = await this.supabaseSync.supabase
      .from("accounts")
      .update({ last_login: new Date().toISOString() })
      .eq("id", accountId);

    if (error) {
      console.error(`[Account] Failed to update last_login for ${accountId}: ${error.message}`);
    }
  }
}

/**
 * Extract clean text output from Xiaowei adbShell response.
 * @param {object} response
 * @returns {string|null}
 */
function _extractAdbOutput(response) {
  if (!response) return null;
  if (typeof response === "string") return response.trim();
  const text = response.output || response.result || response.data || response.stdout;
  if (typeof text === "string") return text.trim();
  if (Array.isArray(response)) return response.join("\n").trim();
  return null;
}

module.exports = AccountManager;
