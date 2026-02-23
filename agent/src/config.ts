import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

export interface FarmConfig {
  proxyList: string[];
  proxyMap: Map<string, string>; // serial → proxy address
  accountMap: Map<string, string>; // serial → email
}

export interface AgentConfig {
  /** PC 번호: "PC00" ~ "PC04" (DB 체크제약: ^PC[0-9]{2}$) */
  pcNumber: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  xiaoweiWsUrl: string;
  heartbeatInterval: number;
  taskPollInterval: number;
  maxConcurrentTasks: number;
  scriptsDir: string;
  configDir: string;
  logsDir: string;
  farm: FarmConfig;
}

function readLines(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function parseProxyMap(filePath: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of readLines(filePath)) {
    const [serial, proxy] = line.includes("=")
      ? line.split("=", 2)
      : line.split(/\s+/, 2);
    if (serial && proxy) {
      map.set(serial.trim(), proxy.trim());
    }
  }
  return map;
}

function parseAccountMap(filePath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(filePath)) return map;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (typeof data === "object" && data !== null) {
      for (const [serial, email] of Object.entries(data)) {
        if (typeof email === "string") {
          map.set(serial, email);
        }
      }
    }
  } catch {
    // malformed JSON
  }
  return map;
}

function loadFarmConfig(configDir: string): FarmConfig {
  return {
    proxyList: readLines(path.join(configDir, "proxy_list.txt")),
    proxyMap: parseProxyMap(path.join(configDir, "proxy_map.txt")),
    accountMap: parseAccountMap(path.join(configDir, "account_map.json")),
  };
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export function loadConfig(): AgentConfig {
  const configDir = process.env.CONFIG_DIR || path.join(process.cwd(), "farm_config");

  // PC_NUMBER: "PC00" format required by DB constraint
  const pcNumber = process.env.PC_NUMBER || "PC00";
  if (!/^PC\d{2}$/.test(pcNumber)) {
    throw new Error(`PC_NUMBER must match "PC00"~"PC99" format, got: "${pcNumber}"`);
  }

  return {
    pcNumber,
    supabaseUrl: required("SUPABASE_URL"),
    supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    xiaoweiWsUrl: process.env.XIAOWEI_WS_URL || "ws://127.0.0.1:22222/",
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "30000", 10),
    taskPollInterval: parseInt(process.env.TASK_POLL_INTERVAL || "5000", 10),
    maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || "20", 10),
    scriptsDir: process.env.SCRIPTS_DIR || "",
    configDir,
    logsDir: process.env.LOGS_DIR || path.join(process.cwd(), "logs"),
    farm: loadFarmConfig(configDir),
  };
}
