/**
 * DoAi.Me Agent - Config loader
 * Loads from process.env (populated by .env via dotenv)
 */
require("dotenv").config();

module.exports = {
  workerName: process.env.WORKER_NAME || "node-pc-01",
  workerId: process.env.WORKER_ID || null,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  xiaoweiWsUrl: process.env.XIAOWEI_WS_URL || "ws://127.0.0.1:22222/",
  scriptsDir: process.env.SCRIPTS_DIR || "",
  screenshotsDir: process.env.SCREENSHOTS_DIR || "",
  configDir: process.env.CONFIG_DIR || "",
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "30000", 10),
  taskPollInterval: parseInt(process.env.TASK_POLL_INTERVAL || "5000", 10),
};
