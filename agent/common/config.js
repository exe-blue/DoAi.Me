/**
 * DoAi.Me Agent — Config Manager (agent/common/config.js)
 *
 * 환경변수 로드 + Supabase 동적 설정 + 시작 시 검증.
 * Emits 'config-updated' on Realtime changes.
 *
 * 사용법:
 *   const config = require('./common/config');
 *   config.validate();  // 필수 설정 검증 (실패 시 throw)
 *
 * 단독 실행 (현재 설정 출력):
 *   node agent/common/config.js
 */
const EventEmitter = require("events");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

// Mapping: DB setting key → config property name
const SETTING_KEY_MAP = {
  heartbeat_interval: "heartbeatInterval",
  adb_reconnect_interval: "adbReconnectInterval",
  proxy_check_interval: "proxyCheckInterval",
  proxy_policy: "proxyPolicy",
  max_concurrent_tasks: "maxConcurrentTasks",
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
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    this.supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
    this.xiaoweiWsUrl = process.env.XIAOWEI_WS_URL || "ws://127.0.0.1:22222/";
    this.scriptsDir = process.env.SCRIPTS_DIR || "";
    this.screenshotsDir = process.env.SCREENSHOTS_DIR || "";
    this.configDir = process.env.CONFIG_DIR || "";

    // ── API Keys (optional) ──
    this.openaiApiKey = process.env.OPENAI_API_KEY || "";
    this.openaiModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.youtubeApiKey = process.env.YOUTUBE_API_KEY || "";

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
    this.deviceInterval = 500;
    this.watchDuration = [30, 120];
    this.taskInterval = [1000, 3000];
    this.maxRetryCount = 3;
    this.logRetentionDays = 7;
    this.commandLogRetentionDays = 30;

    // Task execution engine: true = task_devices SSOT runner; false = legacy job_assignments
    this.useTaskDevicesEngine =
      process.env.USE_TASK_DEVICES_ENGINE === "true" ||
      process.env.USE_TASK_DEVICES_ENGINE === "1";
    this.maxConcurrentDevicesPerPc = parseInt(
      process.env.MAX_CONCURRENT_DEVICES_PER_PC || "10",
      10,
    );
    this.taskDeviceLeaseMinutes = parseInt(
      process.env.TASK_DEVICE_LEASE_MINUTES || "5",
      10,
    );
    this.taskDeviceMaxRetries = parseInt(
      process.env.TASK_DEVICE_MAX_RETRIES || "3",
      10,
    );

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
  /**
   * 필수 설정 검증. 실패 시 Error throw.
   * agent.js 시작 시 호출 권장.
   * @throws {Error}
   */
  validate() {
    const errors = [];

    if (!this.supabaseUrl) errors.push("SUPABASE_URL is required");
    if (!this.supabaseAnonKey) errors.push("SUPABASE_ANON_KEY is required");
    if (!this.xiaoweiWsUrl) errors.push("XIAOWEI_WS_URL is required");
    if (!/^PC-\d{2}$/.test(this.pcNumber))
      errors.push(
        `PC_NUMBER must match PC-XX format, e.g. PC-01 (got: "${this.pcNumber}")`,
      );
    if (this.heartbeatInterval < 5000)
      errors.push(
        `HEARTBEAT_INTERVAL too low: ${this.heartbeatInterval}ms (min: 5000)`,
      );
    if (this.maxConcurrentTasks < 1 || this.maxConcurrentTasks > 100) {
      errors.push(
        `MAX_CONCURRENT_TASKS out of range: ${this.maxConcurrentTasks} (1~100)`,
      );
    }

    if (errors.length > 0) {
      const msg = `[Config] Validation failed:\n  ${errors.join("\n  ")}`;
      console.error(msg);
      throw new Error(msg);
    }

    console.log("[Config] ✓ Validation passed");
    return true;
  }

  /** 환경 이름 (dev=PC00, prod=나머지) */
  get environment() {
    return this.pcNumber === "PC-00" ? "dev" : "prod";
  }

  /** 현재 설정 요약 (민감정보 마스킹) */
  summary() {
    return {
      environment: this.environment,
      pcNumber: this.pcNumber,
      supabaseUrl: this.supabaseUrl
        ? this.supabaseUrl.substring(0, 30) + "..."
        : "(not set)",
      xiaoweiWsUrl: this.xiaoweiWsUrl,
      heartbeatInterval: this.heartbeatInterval,
      taskPollInterval: this.taskPollInterval,
      maxConcurrentTasks: this.maxConcurrentTasks,
      openaiModel: this.openaiModel,
      hasOpenaiKey: !!this.openaiApiKey,
      hasYoutubeKey: !!this.youtubeApiKey,
      hasServiceRoleKey: !!this.supabaseServiceRoleKey,
    };
  }
}

/** 상수 정의 */
const CONSTANTS = {
  // 물리 환경
  MAX_DEVICES_PER_PC: 100,
  DEVICES_PER_GROUP: 20,
  PC_COUNT: 5,
  TOTAL_DEVICES: 500,
  SCREEN_WIDTH: 1080,
  SCREEN_HEIGHT: 1920,

  // 타임아웃
  STALE_THRESHOLD_MS: 30 * 60 * 1000, // 30분
  DEAD_THRESHOLD_MS: 90 * 1000, // 90초 (하트비트)

  // 계정 운영
  ACCOUNT_MAX_CONTINUOUS_HOURS: 4, // 연속 활동 최대 시간
  ACCOUNT_COOLDOWN_MINUTES: 30, // 과활동 후 쿨다운
  ACCOUNT_WARMUP_DAYS: 3, // 신규 계정 워밍업 기간
  ACCOUNT_ROTATION_PER_DEVICE_PER_DAY: 3, // 기기당 일일 로테이션

  // 프록시 운영
  PROXY_MAX_DEVICES: 5, // 프록시당 최대 기기
  PROXY_HEALTH_CHECK_MS: 5 * 60 * 1000, // 5분
  PROXY_FAIL_THRESHOLD: 3, // 연속 실패 → invalid

  // 봇 감지 대응
  BOT_COOLDOWN_CAPTCHA_MIN: 120, // 캡차 → 2시간 쿨다운
  BOT_COOLDOWN_LOGIN_MIN: 30, // 로그인 요구 → 30분
  BOT_MAX_LIKES_PER_HOUR: 10, // 시간당 좋아요 제한
  BOT_MAX_COMMENTS_PER_HOUR: 3, // 시간당 댓글 제한

  // 로그
  LOG_RETENTION_DAYS: 7, // 프로덕션 로그 보관
  LOG_RETENTION_DAYS_DEV: 14, // 개발 로그 보관
};

// Export singleton
const instance = new AgentConfig();
instance.AgentConfig = AgentConfig;
instance.CONSTANTS = CONSTANTS;
module.exports = instance;

// 단독 실행: node agent/common/config.js
if (require.main === module) {
  console.log("═".repeat(50));
  console.log("  DoAi.Me Agent Config");
  console.log("═".repeat(50));
  try {
    instance.validate();
    console.log("\n" + JSON.stringify(instance.summary(), null, 2));
  } catch (err) {
    console.error("\n" + err.message);
    process.exit(1);
  }
  console.log("\nConstants:", JSON.stringify(CONSTANTS, null, 2));
}
