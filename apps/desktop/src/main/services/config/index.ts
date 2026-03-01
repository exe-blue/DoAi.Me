/**
 * Runtime config: load/save from app.getPath('userData')/config.json.
 * Prod: config.json only. Dev: dotenv allowed as override.
 * Windows install: installDir/screenshotsDir default C:\client; xiaowei from Program Files (x86).
 */
import { app } from "electron";
import fs from "fs";
import path from "path";

const isWin = process.platform === "win32";
const DEFAULT_XIAOWEI_DIR = "C:\\Program Files (x86)\\xiaowei";
const DEFAULT_XIAOWEI_EXE = `${DEFAULT_XIAOWEI_DIR}\\xiaowei.exe`;
const DEFAULT_XIAOWEI_TOOLS = `${DEFAULT_XIAOWEI_DIR}\\tools`;

export interface AgentConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey?: string;
  xiaoweiWsUrl: string;
  pcNumber?: string;
  maxConcurrentTasks?: number;
  heartbeatIntervalMs?: number;
  adbReconnectIntervalMs?: number;
  openAiKey?: string;
  /** Windows: install root (e.g. C:\client). Screenshots and launcher use this. */
  installDir?: string;
  /** Directory to save completion screenshots. Default: installDir or C:\client */
  screenshotsDir?: string;
  /** Path to xiaowei.exe (emulator). Launcher starts this before the app. */
  xiaoweiExePath?: string;
  /** Path to xiaowei tools folder (contains adb.exe). ADB commands use this. */
  xiaoweiToolsDir?: string;
  /** Launch at Windows login (Electron app.setLoginItemSettings). */
  openAtLogin?: boolean;
}

export function getDefaultConfig(): AgentConfig {
  const base = {
    supabaseUrl: "",
    supabaseAnonKey: "",
    xiaoweiWsUrl: "ws://127.0.0.1:22222/",
    maxConcurrentTasks: 20,
    heartbeatIntervalMs: 30000,
  };
  if (isWin) {
    return {
      ...base,
      installDir: DEFAULT_XIAOWEI_DIR,
      screenshotsDir: DEFAULT_XIAOWEI_DIR,
      xiaoweiExePath: DEFAULT_XIAOWEI_EXE,
      xiaoweiToolsDir: DEFAULT_XIAOWEI_TOOLS,
    };
  }
  return base as AgentConfig;
}

function getConfigPath(): string {
  const userData = app.getPath("userData");
  return path.join(userData, "config.json");
}

export function loadConfig(): AgentConfig {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AgentConfig>;
    return { ...getDefaultConfig(), ...parsed };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") return getDefaultConfig();
    throw err;
  }
}

export function saveConfig(config: Partial<AgentConfig>): void {
  const configPath = getConfigPath();
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const current = loadConfig();
  const merged = { ...current, ...config };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf8");
}
