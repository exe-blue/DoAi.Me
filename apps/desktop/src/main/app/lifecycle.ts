/**
 * App lifecycle: config, logging, Supabase verify, PC register, Xiaowei connect, graceful shutdown.
 */
import { app } from "electron";
import log from "electron-log";
import {
  loadConfig,
  saveConfig,
  getDefaultConfig,
  type AgentConfig,
} from "../services/config";
import { setupLogging } from "../services/logging";
import {
  createSupabaseClient,
  verifyConnection,
  getOrRegisterPcId,
  resolvePcId,
  updatePcStatus,
  getSupabase,
} from "../services/supabase";
import { connectXiaowei, disconnectXiaowei } from "../services/xiaowei";
import { startSchedulers, stopSchedulers } from "../services/scheduler";
import { initUpdater } from "../services/updater";

let config: AgentConfig = getDefaultConfig();

export async function registerAppLifecycle(): Promise<void> {
  setupLogging();
  log.info("[Lifecycle] DoAi Agent Electron starting");

  config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    log.warn("[Lifecycle] supabaseUrl/supabaseAnonKey missing; set in config.json or run with config");
  } else {
    try {
      createSupabaseClient(
        config.supabaseUrl,
        config.supabaseAnonKey,
        config.supabaseServiceRoleKey
      );
      await verifyConnection();
      log.info("[Lifecycle] Supabase connected");

      const pcNumber = await getOrRegisterPcId();
      await resolvePcId(pcNumber);
      log.info("[Lifecycle] PC registered: ", pcNumber);
    } catch (err) {
      log.error("[Lifecycle] Supabase/PC failed:", err);
      throw err;
    }
  }

  try {
    await connectXiaowei(config.xiaoweiWsUrl, 10000);
    log.info("[Lifecycle] Xiaowei connected");
  } catch (err) {
    log.warn("[Lifecycle] Xiaowei connect failed (will retry):", err);
  }

  startSchedulers();
  initUpdater();

  if (process.platform === "win32" && config.openAtLogin != null) {
    try {
      app.setLoginItemSettings({ openAtLogin: !!config.openAtLogin });
    } catch (e) {
      log.warn("[Lifecycle] setLoginItemSettings failed:", e);
    }
  }

  app.on("before-quit", async () => {
    log.info("[Lifecycle] Shutting down");
    stopSchedulers();
    const supabase = getSupabase();
    if (supabase) await updatePcStatus("offline").catch(() => {});
    disconnectXiaowei();
  });
}

export function getConfig(): AgentConfig {
  return { ...config };
}

export function setConfig(partial: Partial<AgentConfig>): void {
  saveConfig(partial);
  config = loadConfig();
}
