/**
 * DoAi.Me - Preset Command Poller
 * Polls preset_commands (status=pending) for this PC and runs presets via device-presets.
 * Rule: pc_id = currentPcNumber OR pc_id is null OR pc_id = '' OR pc_id = 'ALL' → this PC may claim.
 * No schema change: uses existing preset_commands and status column only.
 */
const presets = require("../device/device-presets");
const logger = require("../lib/logger");

const POLL_INTERVAL_MS = 5000;
const BATCH_LIMIT = 5;

class PresetCommandPoller {
  constructor(xiaowei, supabase, getCurrentPcNumber) {
    this.xiaowei = xiaowei;
    this.supabase = supabase;
    this.getCurrentPcNumber = getCurrentPcNumber;
    this._timer = null;
    this._executing = false;
  }

  start() {
    const pc = this.getCurrentPcNumber();
    logger.info("PresetCommandPoller", `Started (${POLL_INTERVAL_MS / 1000}s interval, pc_number=${pc})`);
    this._timer = setInterval(() => this._poll(), POLL_INTERVAL_MS);
    this._poll();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    logger.info("PresetCommandPoller", "Stopped");
  }

  async _poll() {
    if (this._executing) return;
    const currentPcNumber = this.getCurrentPcNumber();
    if (!currentPcNumber) return;

    try {
      // Claim: pc_id = this PC, or null, or 'ALL' (value rule; no schema change). Empty string = use null or 'ALL' in UI.
      const { data: commands, error } = await this.supabase
        .from("preset_commands")
        .select("*")
        .eq("status", "pending")
        .or(`pc_id.eq.${currentPcNumber},pc_id.is.null,pc_id.eq.ALL`)
        .order("created_at", { ascending: true })
        .limit(BATCH_LIMIT);

      if (error) {
        logger.warn("PresetCommandPoller", `Query error: ${error.message}`, { pc_id: currentPcNumber });
        return;
      }
      if (!commands || commands.length === 0) return;

      this._executing = true;
      logger.info("PresetCommandPoller", `Found ${commands.length} pending command(s)`, { pc_id: currentPcNumber });

      for (const cmd of commands) {
        await this._execute(cmd);
      }
    } catch (err) {
      logger.warn("PresetCommandPoller", `Poll error: ${err.message}`, { pc_id: currentPcNumber });
    } finally {
      this._executing = false;
    }
  }

  async _execute(cmd) {
    const tag = `[PresetCommandPoller] [${(cmd.id || "").toString().substring(0, 8)}]`;

    const { error: updateErr } = await this.supabase
      .from("preset_commands")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", cmd.id);

    if (updateErr) {
      logger.warn("PresetCommandPoller", `Failed to set running: ${updateErr.message}`);
      return;
    }

    const presetName = cmd.preset || "unknown";
    const serialHint = cmd.serial || "ALL";
    console.log(`${tag} Executing: preset=${presetName} serial=${serialHint}`);

    try {
      const serials = await this._resolveSerials(cmd.serial);
      if (serials.length === 0) {
        throw new Error("No devices found");
      }
      console.log(`${tag} Target devices: ${serials.length}`);

      const results = [];
      for (const serial of serials) {
        let result;
        try {
          result = await this._runPreset(presetName, serial, cmd.options || {});
        } catch (err) {
          result = { error: (err && err.message) ? err.message : String(err) };
        }
        results.push({ serial: serial.substring(0, 12), result });
      }

      await this.supabase
        .from("preset_commands")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          result: results,
        })
        .eq("id", cmd.id);

      console.log(`${tag} Completed ✓`);
    } catch (err) {
      const errMsg = (err && err.message) ? err.message : String(err);
      await this.supabase
        .from("preset_commands")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_log: errMsg,
        })
        .eq("id", cmd.id);
      console.error(`${tag} Failed: ${errMsg}`);
    }
  }

  async _resolveSerials(serial) {
    if (serial && String(serial).trim() && String(serial).toLowerCase() !== "all") {
      return [String(serial).trim()];
    }
    try {
      const listRes = await this.xiaowei.list();
      const devices = listRes?.data || listRes || [];
      const arr = Array.isArray(devices) ? devices : [];
      return arr
        .map((d) => d.serial || d.onlySerial || d.serialNumber || d.id)
        .filter(Boolean);
    } catch (err) {
      console.error(`[PresetCommandPoller] list() error: ${err.message}`);
      return [];
    }
  }

  async _runPreset(preset, serial, options) {
    const name = String(preset || "").toLowerCase().replace(/-/g, "_");
    switch (name) {
      case "scan":
        return await presets.scan(this.xiaowei, serial);
      case "optimize":
        return await presets.optimize(this.xiaowei, serial, options);
      case "yttest":
      case "yt_test":
        return await presets.ytTest(this.xiaowei, serial, options);
      case "warmup":
        return await presets.warmup(this.xiaowei, serial, options);
      case "init":
        return await presets.init(this.xiaowei, serial, this.supabase, this.getCurrentPcNumber());
      case "install_apks":
        return await presets.installApks(this.xiaowei, serial, options);
      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }
}

module.exports = PresetCommandPoller;
