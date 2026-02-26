/**
 * DoAi.Me - Command Poller
 * Supabase preset_commands 테이블을 폴링하여 프리셋 명령을 실행
 * 
 * 흐름:
 *   웹 대시보드 → Supabase INSERT (pending)
 *   → CommandPoller 감지 → PresetExecutor 실행
 *   → Supabase UPDATE (completed/failed)
 */

const presets = require("./device-presets");

class CommandPoller {
  constructor(xiaowei, supabase, config = {}) {
    this.xiaowei = xiaowei;
    this.supabase = supabase;
    this.pcId = config.pcId || "PC-00";
    this.pollInterval = (config.commandPollIntervalSec || 5) * 1000;
    this._timer = null;
    this._executing = false;
  }

  start() {
    console.log(
      `[CommandPoller] Started (${this.pollInterval / 1000}s interval, PC: ${this.pcId})`
    );
    this._timer = setInterval(() => this._poll(), this.pollInterval);
    // 시작 즉시 한 번 폴링
    this._poll();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    console.log("[CommandPoller] Stopped");
  }

  async _poll() {
    // 이미 실행 중이면 스킵 (겹침 방지)
    if (this._executing) return;

    try {
      const { data: commands, error } = await this.supabase
        .from("preset_commands")
        .select("*")
        .eq("pc_id", this.pcId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(5);

      if (error) {
        console.error(`[CommandPoller] Query error: ${error.message}`);
        return;
      }

      if (!commands || commands.length === 0) return;

      this._executing = true;
      console.log(
        `[CommandPoller] Found ${commands.length} pending command(s)`
      );

      for (const cmd of commands) {
        await this._execute(cmd);
      }
    } catch (err) {
      console.error(`[CommandPoller] Poll error: ${err.message}`);
    } finally {
      this._executing = false;
    }
  }

  async _execute(cmd) {
    const tag = `[CommandPoller] [${cmd.id.substring(0, 8)}]`;

    // status → running
    await this.supabase
      .from("preset_commands")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", cmd.id);

    console.log(`${tag} Executing: ${cmd.preset} on ${cmd.serial || "ALL"}`);

    try {
      // 대상 디바이스 결정
      const serials = await this._resolveSerials(cmd.serial);
      if (serials.length === 0) {
        throw new Error("No devices found");
      }

      console.log(`${tag} Target devices: ${serials.length}`);

      // 프리셋별 실행
      const results = [];
      for (const serial of serials) {
        let result;
        try {
          result = await this._runPreset(cmd.preset, serial, cmd.options || {});
        } catch (err) {
          result = { error: err.message };
        }
        results.push({ serial: serial.substring(0, 8), result });
      }

      // status → completed
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
      // status → failed
      await this.supabase
        .from("preset_commands")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_log: err.message,
        })
        .eq("id", cmd.id);

      console.error(`${tag} Failed: ${err.message}`);
    }
  }

  async _resolveSerials(serial) {
    if (serial && serial !== "all") {
      return [serial];
    }

    // "all" 또는 null → 이 PC에 연결된 모든 디바이스
    try {
      const listRes = await this.xiaowei.list();
      const devices = listRes.data || [];
      return devices
        .map((d) => d.onlySerial || d.serial || d.serialNumber || d.id)
        .filter(Boolean);
    } catch (err) {
      console.error(`[CommandPoller] list() error: ${err.message}`);
      return [];
    }
  }

  async _runPreset(preset, serial, options) {
    switch (preset) {
      case "scan":
        return await presets.scan(this.xiaowei, serial);

      case "optimize":
        return await presets.optimize(this.xiaowei, serial, options);

      case "yttest":
        return await presets.ytTest(this.xiaowei, serial, options);

      case "warmup":
        return await presets.warmup(this.xiaowei, serial, options);

      case "init":
        return await presets.init(
          this.xiaowei,
          serial,
          this.supabase,
          this.pcId
        );

      case "install_apks":
        return await presets.installApks(this.xiaowei, serial, options);

      default:
        throw new Error(`Unknown preset: ${preset}`);
    }
  }
}

module.exports = CommandPoller;
