/**
 * DoAi.Me Agent - Dynamic Config Manager
 * Loads static env vars + dynamic settings from Supabase.
 * Subscribes to Realtime UPDATE events on the settings table.
 * Emits 'config-updated' with { key, oldValue, newValue } on every change.
 */
const EventEmitter = require("events");
require("dotenv").config({ path: require("path").resolve(__dirname, ".env"), override: true });

// Env validation (warn, don't exit — tests may not have env vars)
const requiredEnv = [
  ["SUPABASE_URL", process.env.SUPABASE_URL],
  ["SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY],
  ["PC_NUMBER", process.env.PC_NUMBER],
];
for (const [name, val] of requiredEnv) {
  if (val === undefined || val === "") {
    console.warn(`[Config] ⚠ Missing env: ${name} (required for production)`);
  }
}

// Mapping: DB setting key → config property name
const SETTING_KEY_MAP = {
  heartbeat_interval: "heartbeatInterval",
  adb_reconnect_interval: "adbReconnectInterval",
  proxy_check_interval: "proxyCheckInterval",
  proxy_policy: "proxyPolicy",
  max_concurrent_tasks: "maxConcurrentTasks",
  task_execution_timeout_ms: "taskExecutionTimeoutMs",
  device_interval: "deviceInterval",
  watch_duration: "watchDuration",
  task_interval: "taskInterval",
  max_retry_count: "maxRetryCount",
  log_retention_days: "logRetentionDays",
  command_log_retention_days: "commandLogRetentionDays",
};

class AgentConfig extends EventEmitter {
  constructor() {
    super();

    // ── Static env vars (never change at runtime) ──
    this.pcNumber = process.env.PC_NUMBER || "PC-00";
    this.agentVersion = process.env.AGENT_VERSION || "0.1.0-alpha";
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    this.supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
    this.xiaoweiWsUrl = process.env.XIAOWEI_WS_URL || "ws://127.0.0.1:22222/";
    this.scriptsDir = process.env.SCRIPTS_DIR || "";
    this.screenshotsDir = process.env.SCREENSHOTS_DIR || "";
    this.configDir = process.env.CONFIG_DIR || "";

    // ── Dynamic settings (env defaults, overridden by DB) ──
    this.heartbeatInterval = parseInt(
      process.env.HEARTBEAT_INTERVAL || "30000",
      10,
    );
    this.taskPollInterval = parseInt(
      process.env.TASK_POLL_INTERVAL || "5000",
      10,
    );
    this.adbReconnectInterval = 60000;
    this.proxyCheckInterval = 300000;
    this.proxyPolicy = "sticky";
    this.maxConcurrentTasks = parseInt(
      process.env.MAX_CONCURRENT_TASKS || "10",
      10,
    );
    this.taskExecutionTimeoutMs = parseInt(
      process.env.TASK_EXECUTION_TIMEOUT_MS || "300000",
      10,
    ); // 5 min default
    this.deviceInterval = 500;
    this.watchDuration = [30, 120];
    this.taskInterval = [1000, 3000];
    this.maxRetryCount = 3;
    this.logRetentionDays = 7;
    this.commandLogRetentionDays = 30;

    this.isPrimaryPc =
      process.env.IS_PRIMARY_PC === "true" ||
      process.env.IS_PRIMARY_PC === "1" ||
      false;

    // Internal
    this._settings = {}; // raw DB values keyed by setting key
    this._settingsChannel = null;
  }

  /**
   * Load all settings from DB on startup.
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  async loadFromDB(supabase) {
    const { data, error } = await supabase
      .from("settings")
      .select("key, value, description, updated_at");

    if (error) {
      console.error(
        `[Config] Failed to load settings from DB: ${error.message}`,
      );
      return;
    }

    for (const row of data || []) {
      this._applySettingFromDB(row.key, row.value);
    }

    console.log(`[Config] Loaded ${data?.length || 0} setting(s) from DB`);
    this._logAllSettings();
  }

  /**
   * Subscribe to Realtime UPDATE events on the settings table.
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  subscribeToChanges(supabase) {
    this._settingsChannel = supabase
      .channel("settings-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "settings" },
        (payload) => {
          const { key, value } = payload.new;
          const propName = SETTING_KEY_MAP[key];
          const oldValue = propName ? this[propName] : this._settings[key];

          this._applySettingFromDB(key, value);

          const newValue = propName ? this[propName] : this._settings[key];
          console.log(
            `[Config] ${key}: ${JSON.stringify(oldValue)} → ${JSON.stringify(newValue)}`,
          );
          this.emit("config-updated", { key, oldValue, newValue });
        },
      )
      .subscribe((status) => {
        console.log(`[Config] Settings Realtime status: ${status}`);
      });
  }

  /**
   * Parse a raw DB value and apply it to the config.
   * @param {string} key - DB setting key
   * @param {string} rawValue - JSON-encoded value string
   */
  _applySettingFromDB(key, rawValue) {
    let value;
    try {
      value = JSON.parse(rawValue);
    } catch {
      value = rawValue;
    }
    this._settings[key] = value;

    const propName = SETTING_KEY_MAP[key];
    if (propName) {
      this[propName] = value;
    }
  }

  /** Log all current dynamic settings for diagnostics. */
  _logAllSettings() {
    console.log("[Config] Current settings:");
    for (const [key, value] of Object.entries(this._settings)) {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }

  /**
   * Get a raw setting value by DB key.
   * @param {string} key
   * @returns {*}
   */
  get(key) {
    return this._settings[key];
  }

  /**
   * Unsubscribe from Realtime channel.
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  async unsubscribe(supabase) {
    if (this._settingsChannel) {
      await supabase.removeChannel(this._settingsChannel);
      this._settingsChannel = null;
      console.log("[Config] Settings Realtime unsubscribed");
    }
  }
}

// Export singleton (preserves backward compatibility: config.heartbeatInterval works)
const instance = new AgentConfig();
instance.AgentConfig = AgentConfig; // Expose class for testing
module.exports = instance;
