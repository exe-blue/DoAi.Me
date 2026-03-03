import { execFile } from "child_process";
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import Store from "electron-store";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import WebSocket from "ws";
import * as agentRunner from "./agentRunner";

// ─── Fatal boot logger: %TEMP%\doaime-boot.log (no userData dependency) ───
const BOOT_LOG_PATH =
  process.platform === "win32"
    ? path.join(process.env.TEMP || "C:\\", "doaime-boot.log")
    : path.join(process.env.HOME || "/tmp", "doaime-boot.log");

function bootLog(msg: string): void {
  try {
    fs.appendFileSync(BOOT_LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // ignore
  }
}

function bootLogError(msg: string, err?: unknown): void {
  const extra =
    err instanceof Error ? err.stack : err != null ? (typeof err === "object" ? JSON.stringify(err) : String(err)) : "";
  bootLog(`${msg} ${extra}`.trim());
}

function getBootLogPath(): string {
  return BOOT_LOG_PATH;
}

function showFatalDialog(title: string, detail: string): void {
  const bootPath = getBootLogPath();
  const full = `${detail}\n\nBoot log: ${bootPath}`;
  try {
    if (typeof dialog !== "undefined" && dialog.showMessageBoxSync) {
      dialog.showMessageBoxSync({
        type: "error",
        title: title || "DoAi.Me Fatal Error",
        message: title || "DoAi.Me Fatal Error",
        detail: full,
        noLink: true,
      });
    }
  } catch {
    bootLog(`showFatalDialog failed: ${title} ${detail}`);
  }
}

process.on("uncaughtException", (err: Error) => {
  bootLogError("uncaughtException", err);
  showFatalDialog("Uncaught Exception", err.message || String(err));
  process.exit(1);
});

process.on("unhandledRejection", (reason: unknown) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : "";
  bootLogError(`unhandledRejection: ${msg}`, stack ? { stack } : reason);
  showFatalDialog("Unhandled Promise Rejection", msg);
});

app.on("render-process-gone", (_event, _webContents, details) => {
  bootLogError("render-process-gone", details);
  showFatalDialog("Render Process Gone", details.reason || JSON.stringify(details));
});

app.on("child-process-gone", (_event, details) => {
  bootLogError("child-process-gone", details);
  showFatalDialog("Child Process Gone", details.type || JSON.stringify(details));
});

bootLog("main.ts loaded");
process.on("uncaughtException", (err) => bootLogError("UNCAUGHT_EXCEPTION", err));
process.on("unhandledRejection", (err: unknown) => bootLogError("UNHANDLED_REJECTION", err));

// Squirrel: installer/updater lifecycle; exit without starting app
const isSquirrel = process.argv.some((a) => typeof a === "string" && a.startsWith("--squirrel-"));
if (isSquirrel) {
  bootLog("BOOT_SQUIRREL exit");
  app.quit();
  process.exit(0);
}

// Packaged: load resources/.env then resources/agent/.env; explicitly inject SUPABASE_*, XIAOWEI_WS_URL into process.env.
if (typeof process !== "undefined" && app.isPackaged && typeof process.resourcesPath === "string") {
  const resourcesEnv = path.join(process.resourcesPath, ".env");
  const agentEnvPath = path.join(process.resourcesPath, "agent", ".env");
  const r = dotenv.config({ path: resourcesEnv });
  const a = dotenv.config({ path: agentEnvPath });
  bootLog(`BOOT_1 env packaged: resources/.env ${r.error ? "missing" : "loaded"}, agent/.env ${a.error ? "missing" : "loaded"}`);
  if (r.error) bootLog(`BOOT_1 env resources/.env path=${resourcesEnv}`);
  if (a.error) bootLog(`BOOT_1 env agent/.env path=${agentEnvPath}`);
  const inject = (parsed: Record<string, string> | undefined) => {
    if (!parsed) return;
    if (parsed.SUPABASE_URL?.trim()) process.env.SUPABASE_URL = parsed.SUPABASE_URL.trim();
    if (parsed.SUPABASE_ANON_KEY?.trim()) process.env.SUPABASE_ANON_KEY = parsed.SUPABASE_ANON_KEY.trim();
    if (parsed.XIAOWEI_WS_URL?.trim()) process.env.XIAOWEI_WS_URL = parsed.XIAOWEI_WS_URL.trim();
  };
  inject(r.parsed);
  inject(a.parsed);
  if (!process.env.SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (!process.env.SUPABASE_ANON_KEY?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
} else {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  dotenv.config({ path: path.resolve(process.cwd(), ".env.prod") });
  dotenv.config({ path: path.resolve(process.cwd(), ".env") });
  if (!process.env.SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
  if (!process.env.SUPABASE_ANON_KEY?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    process.env.SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }
  bootLog("BOOT_1 env (dev) load done");
}
bootLog("BOOT_1 env load done");

const gotLock = app.requestSingleInstanceLock();
bootLog(`BOOT_LOCK gotLock=${gotLock}`);

if (!gotLock) {
  bootLog("BOOT_LOCK failed -> quit");
  app.quit();
} else {
  app.on("second-instance", () => {
    bootLog("EVT second-instance");
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  bootLog("BOOT_REG before whenReady");
  app
    .whenReady()
    .then(() => {
      bootLog("BOOT_1 whenReady");
      try {
        bootLog("BOOT_CW_0 enter");
        createWindow();
        bootLog(`BOOT_CW_1 ok windows=${BrowserWindow.getAllWindows().length}`);
      } catch (err) {
        bootLogError("BOOT_CW_THROW", err);
        const win = new BrowserWindow({
          width: 1100,
          height: 700,
          show: true,
          title: "DoAi.Me (Safe UI)",
          webPreferences: { contextIsolation: true },
        });
        win.loadURL(
          "data:text/html," +
            encodeURIComponent(`
              <h2>Safe UI boot</h2>
              <pre>createWindow() threw. Check %TEMP%\\doaime-boot.log</pre>
            `),
        );
      }
      bootLog("BOOT_2 createWindow done");
      setImmediate(() => startBackgroundInit());
    })
    .catch((err) => bootLogError("WHENREADY_THROW", err));

  bootLog("BOOT_REG after whenReady");

  app.on("before-quit", async () => {
    agentRunner.stopAgent();
    stopDevicePolling();
    if (!IS_WS_ONLY_PROVIDER) {
      await adb(["kill-server"]);
    }
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (mainWindow === null) createWindow();
  });
}

const AGENT_SETTINGS_FILE = path.join(app.getPath("userData"), "agent-settings.json");

interface AgentSettings {
  pc_number?: string | null;
  xiaowei_ws_url?: string | null;
  web_dashboard_url?: string | null;
  openai_api_key?: string | null;
}

function getAgentSettings(): AgentSettings {
  try {
    if (fs.existsSync(AGENT_SETTINGS_FILE)) {
      const raw = fs.readFileSync(AGENT_SETTINGS_FILE, "utf8");
      return JSON.parse(raw) as AgentSettings;
    }
  } catch {
    // ignore
  }
  return {};
}

function setAgentSettings(payload: AgentSettings): AgentSettings {
  const current = getAgentSettings();
  const next: AgentSettings = {
    ...current,
    ...(payload.pc_number !== undefined && { pc_number: payload.pc_number }),
    ...(payload.xiaowei_ws_url !== undefined && { xiaowei_ws_url: payload.xiaowei_ws_url }),
    ...(payload.web_dashboard_url !== undefined && { web_dashboard_url: payload.web_dashboard_url }),
    ...(payload.openai_api_key !== undefined && { openai_api_key: payload.openai_api_key }),
  };
  fs.mkdirSync(path.dirname(AGENT_SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(AGENT_SETTINGS_FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Env passed to agent spawn. SUPABASE_* from process.env (loaded from resources/.env when packaged); PC_NUMBER and XIAOWEI_WS_URL from agent-settings.json (or env fallback). */
function getAgentEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  out.SUPABASE_URL = process.env.SUPABASE_URL ?? "";
  out.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
  const file = getAgentSettings();
  // PC_NUMBER from Settings UI (agent-settings.json); empty on first run until user sets it
  out.PC_NUMBER = file.pc_number ?? process.env.PC_NUMBER ?? "";
  out.XIAOWEI_WS_URL = file.xiaowei_ws_url ?? process.env.XIAOWEI_WS_URL ?? "ws://127.0.0.1:22222/";
  if (!out.XIAOWEI_WS_URL.startsWith("ws://") && !out.XIAOWEI_WS_URL.startsWith("wss://")) {
    out.XIAOWEI_WS_URL = "ws://" + out.XIAOWEI_WS_URL.replace(/^\/+|\/+$/g, "");
  }
  if (file.openai_api_key ?? process.env.OPENAI_API_KEY) out.OPENAI_API_KEY = file.openai_api_key ?? process.env.OPENAI_API_KEY ?? "";
  if (process.env.XIAOWEI_TOOLS_DIR) out.XIAOWEI_TOOLS_DIR = process.env.XIAOWEI_TOOLS_DIR ?? "";
  out.AGENT_SETTINGS_PATH = AGENT_SETTINGS_FILE;
  if (!out.SUPABASE_URL.trim()) log.warn("[Main] getAgentEnv: SUPABASE_URL is empty — set resources/.env or resources/agent/.env when packaged.");
  if (!out.SUPABASE_ANON_KEY.trim()) log.warn("[Main] getAgentEnv: SUPABASE_ANON_KEY is empty — agent may exit immediately.");
  if (!file.xiaowei_ws_url?.trim() && !process.env.XIAOWEI_WS_URL?.trim()) {
    log.warn("[Main] getAgentEnv: XIAOWEI_WS_URL is empty — agent will use default ws://127.0.0.1:22222/");
  }
  return out;
}

/** Log getAgentEnv() result masked for desktop.log (SUPABASE_URL host only, anon key length + prefix 6, XIAOWEI_WS_URL). */
function logAgentEnvMasked(env: Record<string, string>): void {
  let supabaseHost = "(empty)";
  if (env.SUPABASE_URL?.trim()) {
    try {
      const u = new URL(env.SUPABASE_URL.trim());
      supabaseHost = u.host;
    } catch {
      supabaseHost = "(invalid URL)";
    }
  }
  const keyPresent = !!(env.SUPABASE_ANON_KEY?.trim());
  const keyLen = env.SUPABASE_ANON_KEY?.length ?? 0;
  const keyPrefix = env.SUPABASE_ANON_KEY?.trim().slice(0, 6) ?? "";
  log.info(
    "[Main] Agent env (masked): SUPABASE_URL host=%s, SUPABASE_ANON_KEY present=%s length=%s prefix=%s, XIAOWEI_WS_URL=%s",
    supabaseHost,
    keyPresent,
    keyLen,
    keyPrefix ? `${keyPrefix}…` : "(none)",
    env.XIAOWEI_WS_URL ?? "(default)"
  );
}

const execFileAsync = promisify(execFile);
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const PRELOAD_PATH = path.join(__dirname, "../preload/preload.js");
const LAUNCH_AT_LOGIN_FILE = path.join(app.getPath("userData"), "launch-at-login.json");
/** Device control is WS-only (22222). No HTTP API (22222). */
const DEVICE_CONTROL_PROVIDER = process.env.DEVICE_CONTROL_PROVIDER ?? "xiaowei_ws";
const IS_WS_ONLY_PROVIDER =
  DEVICE_CONTROL_PROVIDER === "xiaowei_ws" || DEVICE_CONTROL_PROVIDER === "xiaowei_ws";
/** Readiness and agent: WebSocket only (22222). No HTTP. */
const XIAOWEI_WS_URL = process.env.XIAOWEI_WS_URL ?? "ws://127.0.0.1:22222/";

const POLL_INTERVAL_MS = 5000;
const COMMAND_TIMEOUT_MS = 10000;
const COMMAND_TIMEOUT_WARN_MS = 3000;
const MAX_LOG_LINES = 500;
const MAX_ALERTS = 100;
const MAX_PRESET_HISTORY = 100;
const DEVICE_CONCURRENCY_MAX = 10;

type DeviceState = "device" | "unauthorized" | "offline" | "no_device";
type Severity = "OK" | "WARN" | "ERROR";
type PresetStep = "PRE_CHECK" | "APPLY" | "VERIFY" | "RESULT";
type PresetId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";
type AlertType = "UNAUTHORIZED" | "ADB_DOWN" | "CMD_FAILED" | "SCREENSHOT_FAIL" | "VERIFY_FAIL";

interface Device {
  serial: string;
  state: DeviceState;
  model?: string;
  ip?: string;
  sdkVersion?: number;
  transportId?: string;
}

interface PresetStepResult {
  step: PresetStep;
  success: boolean;
  message: string;
  timestamp: number;
  durationMs: number;
}

interface PresetResult {
  presetId: PresetId;
  serial: string;
  overallSuccess: boolean;
  steps: PresetStepResult[];
  severity: Severity;
}

interface PresetExecutePayload {
  serial: string[];
  presetId: PresetId;
  options?: Record<string, unknown>;
}

interface PresetExecuteResponse {
  results: PresetResult[];
}

interface LogEntry {
  timestamp: number;
  presetName: string;
  step: PresetStep;
  level: LogLevel;
  message: string;
  serial?: string;
}

interface AlertItem {
  id: string;
  timestamp: number;
  severity: "WARN" | "ERROR";
  serial?: string;
  type: AlertType;
  message: string;
}

interface AppSettings {
  imeId: string;
  screenshotDir: string;
  expectedDeviceCount: number;
}

interface ExecResult {
  success: boolean;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface ExecBufferResult {
  success: boolean;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
}

const settingsStore = new Store<AppSettings>({
  name: "settings",
  defaults: {
    imeId: "com.google.android.inputmethod.korean/.KoreanIME",
    screenshotDir: process.platform === "win32" ? "C:\\task\\screenshot" : path.join(app.getPath("pictures"), "doai-me"),
    expectedDeviceCount: 10,
  },
}) as unknown as {
  get<K extends keyof AppSettings>(key: K): AppSettings[K];
  set(value: Partial<AppSettings>): void;
  store: AppSettings;
};

const state: {
  devices: Device[];
  logBuffer: LogEntry[];
  alertQueue: AlertItem[];
  presetHistory: PresetResult[];
  adbHealthy: boolean;
  pollTimer: NodeJS.Timeout | null;
} = {
  devices: [],
  logBuffer: [],
  alertQueue: [],
  presetHistory: [],
  adbHealthy: false,
  pollTimer: null,
};

let mainWindow: BrowserWindow | null = null;
let runningDeviceJobs = 0;
const deviceQueueTails = new Map<string, Promise<void>>();
const concurrencyWaiters: Array<() => void> = [];

function now(): number {
  return Date.now();
}

function resolveAdbPath(): string {
  if (process.env.ADB_PATH && process.env.ADB_PATH.trim().length > 0) {
    return process.env.ADB_PATH;
  }
  if (app.isPackaged && process.platform === "win32") {
    return path.join(process.resourcesPath, "platform-tools", "adb.exe");
  }
  return process.platform === "win32" ? "adb.exe" : "adb";
}

const XIAOWEI_WS_PRECHECK_TIMEOUT_MS = 5000;

/** PRE_CHECK: Xiaowei reachability via WebSocket (22222). Success = open / 101 handshake. */
async function xiaoweiWsPreCheck(): Promise<{ success: boolean; error?: string }> {
  const effectiveWsUrl = XIAOWEI_WS_URL;
  log.info(`[MAIN_PRECHECK] effective WS url=${effectiveWsUrl}`);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* ignore */ }
      log.warn(`[MAIN_PRECHECK] result=fail error=timeout (${XIAOWEI_WS_PRECHECK_TIMEOUT_MS}ms)`);
      resolve({ success: false, error: "timeout" });
    }, XIAOWEI_WS_PRECHECK_TIMEOUT_MS);
    let done = false;
    const ws = new WebSocket(effectiveWsUrl);
    ws.on("open", () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      log.info(`[MAIN_PRECHECK] result=success (WebSocket open / 101)`);
      resolve({ success: true });
    });
    ws.on("error", (err: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      const errMsg = err?.message ?? String(err);
      log.warn(`[MAIN_PRECHECK] result=fail error=${errMsg}`);
      resolve({ success: false, error: errMsg });
    });
    ws.on("close", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        log.warn(`[MAIN_PRECHECK] result=fail error=closed before open`);
        resolve({ success: false, error: "closed before open" });
      }
    });
  });
}

/** One-shot WS request to Xiaowei (22222). Used for list when DEVICE_CONTROL_PROVIDER is xiaowei_ws. */
async function xiaoweiWsRequestOnce(
  payload: Record<string, unknown>,
  timeoutMs = 3000
): Promise<{ success: boolean; stdout?: string; stderr?: string }> {
  const wsUrl = XIAOWEI_WS_URL;
  return new Promise((resolve) => {
    let done = false;
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* ignore */ }
      resolve({ success: false, stderr: `timeout (${timeoutMs}ms)` });
    }, timeoutMs);

    ws.on("open", () => {
      try {
        ws.send(JSON.stringify(payload));
      } catch (e: unknown) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
        resolve({ success: false, stderr: (e as Error)?.message ?? String(e) });
      }
    });

    ws.on("message", (data: Buffer | string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      const str = typeof data === "string" ? data : (data as Buffer).toString("utf8");
      resolve({ success: true, stdout: str });
    });

    ws.on("error", (err: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve({ success: false, stderr: err?.message ?? String(err) });
    });

    ws.on("close", () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        resolve({ success: false, stderr: "closed before message" });
      }
    });
  });
}

/** Parse Xiaowei WS list response JSON into Device[] shape. */
function parseXiaoweiListJson(jsonText: string): Array<{ serial: string; model?: string; state: DeviceState }> {
  const data = JSON.parse(jsonText) as unknown;
  const arr = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data ?? [];
  return (Array.isArray(arr) ? arr : []).map((d: { serial?: string; onlySerial?: string; serialNumber?: string; model?: string; status?: string }) => ({
    serial: d.serial ?? d.onlySerial ?? d.serialNumber ?? "",
    model: d.model,
    state: (d.status === "offline" ? "offline" : "device") as DeviceState,
  })).filter((d) => d.serial);
}

function sendToRenderer(channel: "log:stream" | "device:update", payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function pushLog(entry: Omit<LogEntry, "timestamp">): void {
  const enriched: LogEntry = { ...entry, timestamp: now() };
  state.logBuffer.push(enriched);
  if (state.logBuffer.length > MAX_LOG_LINES) {
    state.logBuffer.splice(0, state.logBuffer.length - MAX_LOG_LINES);
  }
  sendToRenderer("log:stream", enriched);
  log.info(`[${enriched.level}] [${enriched.presetName}] [${enriched.step}] ${enriched.message}`);
}

function pushAlert(alert: Omit<AlertItem, "id" | "timestamp">): void {
  const item: AlertItem = {
    ...alert,
    id: `${now()}-${Math.random().toString(16).slice(2)}`,
    timestamp: now(),
  };
  state.alertQueue.push(item);
  if (state.alertQueue.length > MAX_ALERTS) {
    state.alertQueue.splice(0, state.alertQueue.length - MAX_ALERTS);
  }
  log.error(`[ALERT:${item.type}] ${item.message}`);
}

async function runCommand(file: string, args: string[], timeout = COMMAND_TIMEOUT_MS): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
      encoding: "utf8",
    });
    return { success: true, stdout: stdout ?? "", stderr: stderr ?? "", timedOut: false };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; killed?: boolean; signal?: NodeJS.Signals };
    const timedOut = err.killed === true && err.signal === "SIGTERM";
    if (timedOut) {
      pushLog({
        level: "ERROR",
        presetName: "SYSTEM",
        step: "APPLY",
        message: `[TIMEOUT] ${file} ${args.join(" ")}`,
      });
    }
    return {
      success: false,
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
      timedOut,
    };
  }
}

async function runCommandBinary(file: string, args: string[], timeout = COMMAND_TIMEOUT_MS): Promise<ExecBufferResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout, windowsHide: true, maxBuffer: 10 * 1024 * 1024, encoding: "buffer" },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            success: true,
            stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? ""),
            stderr: Buffer.isBuffer(stderr) ? stderr.toString("utf8") : (stderr ?? ""),
            timedOut: false,
          });
          return;
        }
        const timedOut = (error as NodeJS.ErrnoException & { killed?: boolean; signal?: NodeJS.Signals }).killed === true
          && (error as NodeJS.ErrnoException & { signal?: NodeJS.Signals }).signal === "SIGTERM";
        resolve({
          success: false,
          stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? ""),
          stderr: Buffer.isBuffer(stderr) ? stderr.toString("utf8") : (stderr ?? (error as Error).message),
          timedOut,
        });
      }
    );
  });
}

async function adb(args: string[], timeout = COMMAND_TIMEOUT_MS): Promise<ExecResult> {
  return runCommand(resolveAdbPath(), args, timeout);
}

async function adbBinary(args: string[], timeout = COMMAND_TIMEOUT_MS): Promise<ExecBufferResult> {
  return runCommandBinary(resolveAdbPath(), args, timeout);
}

async function adbShell(serial: string, command: string, timeout = COMMAND_TIMEOUT_MS): Promise<ExecResult> {
  return adb(["-s", serial, "shell", command], timeout);
}

function parseDevices(raw: string): Device[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("List of devices attached"));
  return lines.map((line) => {
    const parts = line.split(/\s+/);
    const serial = parts[0] ?? "";
    const stateText = parts[1] ?? "no_device";
    const state: DeviceState =
      stateText === "device" || stateText === "offline" || stateText === "unauthorized" ? stateText : "no_device";
    const model = parts.find((p) => p.startsWith("model:"))?.slice("model:".length);
    const transportId = parts.find((p) => p.startsWith("transport_id:"))?.slice("transport_id:".length);
    return { serial, state, model, transportId };
  });
}

function parseIpFromIpAddr(stdout: string): string | undefined {
  const match = stdout.match(/inet\s+(\d{1,3}(?:\.\d{1,3}){3})\//);
  return match?.[1];
}

async function fetchDeviceDetails(device: Device): Promise<Device> {
  if (device.state !== "device") return device;
  const [ipRes, sdkRes] = await Promise.all([
    adbShell(device.serial, "ip addr show wlan0"),
    adbShell(device.serial, "getprop ro.build.version.sdk"),
  ]);
  const ip = ipRes.success ? parseIpFromIpAddr(ipRes.stdout) : undefined;
  const sdkVersion = sdkRes.success ? Number.parseInt(sdkRes.stdout.trim(), 10) : undefined;
  return {
    ...device,
    ip,
    sdkVersion: Number.isFinite(sdkVersion ?? Number.NaN) ? sdkVersion : undefined,
  };
}

let previousUnauthorizedCount = 0;

async function pollDevicesOnce(): Promise<void> {
  // 1. Reachability: WS-only = WS 22222 only; adb = adb version. Never use HTTP/fetch.
  const adbHealth =
    IS_WS_ONLY_PROVIDER
      ? await (async (): Promise<ExecResult> => {
          const wsCheck = await xiaoweiWsPreCheck();
          return wsCheck.success
            ? { success: true, stdout: "", stderr: "", timedOut: false }
            : { success: false, stdout: "", stderr: wsCheck.error ?? "WebSocket precheck failed", timedOut: false };
        })()
      : await adb(["version"], COMMAND_TIMEOUT_WARN_MS);
  const healthy = adbHealth.success;
  if (!healthy) {
    const effectiveUrl = IS_WS_ONLY_PROVIDER ? XIAOWEI_WS_URL : "—";
    const errMsg = adbHealth.stderr || "ADB did not respond to adb version";
    log.warn(`[MAIN_PRECHECK] result=fail effectiveUrl=${effectiveUrl} error=${errMsg}`);
    if (state.adbHealthy) {
      pushLog({
        level: "ERROR",
        presetName: "SYSTEM",
        step: "PRE_CHECK",
        message: `Xiaowei 연결 실패 (WS): url=${effectiveUrl} error=${errMsg}`,
      });
      pushAlert({
        severity: "ERROR",
        type: "ADB_DOWN",
        message: errMsg,
      });
    }
  }
  state.adbHealthy = healthy;

  // 2. Only proceed to device list once connection is confirmed
  if (!healthy) return;

  // WS-only: do NOT call adb(["devices","-l"]). Device list from WS action "list" only.
  const ws = await xiaoweiWsPreCheck();
  if (!ws.success) {
    pushLog({
      level: "WARN",
      presetName: "SYSTEM",
      step: "PRE_CHECK",
      message: `xiaowei_ws [OFFLINE]: ${ws.error ?? "unknown"}`,
    });
    return;
  }

  const listRes = await xiaoweiWsRequestOnce({ action: "list" }, 3000);
  if (!listRes.success || !listRes.stdout) {
    pushLog({
      level: "WARN",
      presetName: "SYSTEM",
      step: "PRE_CHECK",
      message: `xiaowei_ws [LIST_FAILED]: ${listRes.stderr ?? "no response"}`,
    });
    return;
  }

  try {
    const mapped = parseXiaoweiListJson(listRes.stdout);
    state.devices = mapped;
    sendToRenderer("device:update", state.devices);
    if (mapped.length === 0) {
      pushLog({
        level: "INFO",
        presetName: "SYSTEM",
        step: "PRE_CHECK",
        message: "devices [NO_DEVICES]: 연결된 기기 없음",
      });
    }
  } catch (e: unknown) {
    pushLog({
      level: "WARN",
      presetName: "SYSTEM",
      step: "PRE_CHECK",
      message: `xiaowei_ws [LIST_PARSE_FAILED]: ${(e as Error)?.message ?? String(e)}`,
    });
  }
}

function startDevicePolling(): void {
  if (state.pollTimer) return;
  state.pollTimer = setInterval(() => {
    void pollDevicesOnce();
  }, POLL_INTERVAL_MS);
  void pollDevicesOnce();
}

function stopDevicePolling(): void {
  if (!state.pollTimer) return;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function addPresetHistory(result: PresetResult): void {
  state.presetHistory.push(result);
  if (state.presetHistory.length > MAX_PRESET_HISTORY) {
    state.presetHistory.splice(0, state.presetHistory.length - MAX_PRESET_HISTORY);
  }
}

async function withGlobalDeviceLimit<T>(fn: () => Promise<T>): Promise<T> {
  if (runningDeviceJobs >= DEVICE_CONCURRENCY_MAX) {
    await new Promise<void>((resolve) => {
      concurrencyWaiters.push(resolve);
    });
  }
  runningDeviceJobs += 1;
  try {
    return await fn();
  } finally {
    runningDeviceJobs -= 1;
    const next = concurrencyWaiters.shift();
    if (next) next();
  }
}

function enqueueByDevice<T>(serial: string, task: () => Promise<T>): Promise<T> {
  const currentTail = deviceQueueTails.get(serial) ?? Promise.resolve();
  const next = currentTail
    .catch(() => undefined)
    .then(() => withGlobalDeviceLimit(task))
    .finally(() => {
      if (deviceQueueTails.get(serial) === next) {
        deviceQueueTails.delete(serial);
      }
    }) as Promise<T>;
  deviceQueueTails.set(serial, next.then(() => undefined));
  return next;
}

function stepResult(step: PresetStep, success: boolean, message: string, startedAt: number): PresetStepResult {
  return {
    step,
    success,
    message,
    timestamp: startedAt,
    durationMs: now() - startedAt,
  };
}

function recordStepLog(level: LogLevel, presetName: string, step: PresetStep, serial: string, message: string): void {
  pushLog({
    presetName,
    step,
    level,
    serial,
    message: `[${serial}] ${message}`,
  });
}

function ipv4Regex(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

async function executePreset(serial: string, presetId: PresetId, options?: Record<string, unknown>): Promise<PresetResult> {
  const presetName = `PRESET_${presetId}`;
  const steps: PresetStepResult[] = [];
  let overallSuccess = true;
  let severity: Severity = "OK";

  const failWith = (step: PresetStep, message: string, type: AlertType, sev: Severity = "ERROR"): PresetResult => {
    overallSuccess = false;
    severity = sev;
    steps.push(stepResult(step, false, message, now()));
    recordStepLog("ERROR", presetName, step, serial, message);
    pushAlert({
      severity: sev === "WARN" ? "WARN" : "ERROR",
      serial,
      type,
      message,
    });
    return { presetId, serial, overallSuccess, steps, severity };
  };

  if (presetId === 1) {
    const preStart = now();
    const sdkRes = await adbShell(serial, "getprop ro.build.version.sdk");
    if (!sdkRes.success) return failWith("PRE_CHECK", `[LANG] SDK 조회 실패: ${sdkRes.stderr}`, "CMD_FAILED");
    const sdkVersion = Number.parseInt(sdkRes.stdout.trim(), 10);
    steps.push(stepResult("PRE_CHECK", true, `SDK=${sdkVersion}`, preStart));

    const applyStart = now();
    const applyRes = sdkVersion >= 24
      ? await adbShell(serial, "settings put system system_locales ko-KR")
      : await adbShell(serial, "setprop persist.sys.language ko; setprop persist.sys.country KR");
    if (!applyRes.success) return failWith("APPLY", `[LANG] 적용 실패: ${applyRes.stderr}`, "CMD_FAILED");
    steps.push(stepResult("APPLY", true, "Language commands applied", applyStart));

    const verifyStart = now();
    const verifyRes = sdkVersion >= 24
      ? await adbShell(serial, "settings get system system_locales")
      : await adbShell(serial, "getprop persist.sys.language");
    const value = verifyRes.stdout.trim();
    if (!verifyRes.success || !value.includes("ko")) {
      return failWith("VERIFY", `[LANG] 검증 실패: 현재 값=${value || verifyRes.stderr}`, "VERIFY_FAIL");
    }
    steps.push(stepResult("VERIFY", true, `Verified value=${value}`, verifyStart));
  } else if (presetId === 2) {
    const imeId = typeof options?.imeId === "string" && options.imeId.length > 0
      ? options.imeId
      : settingsStore.get("imeId");
    const preStart = now();
    const listRes = await adbShell(serial, "ime list -s");
    if (!listRes.success) return failWith("PRE_CHECK", `[IME] ime list 조회 실패: ${listRes.stderr}`, "CMD_FAILED");
    const installed = listRes.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!installed.includes(imeId)) {
      return failWith("PRE_CHECK", `[IME] ${imeId} 미설치. 설치된 IME=${installed.join(", ")}`, "CMD_FAILED", "WARN");
    }
    steps.push(stepResult("PRE_CHECK", true, `IME found: ${imeId}`, preStart));

    const applyStart = now();
    const enableRes = await adbShell(serial, `ime enable ${imeId}`);
    const setRes = await adbShell(serial, `ime set ${imeId}`);
    if (!enableRes.success || !setRes.success) {
      return failWith("APPLY", `[IME] 적용 실패: ${enableRes.stderr || setRes.stderr}`, "CMD_FAILED");
    }
    steps.push(stepResult("APPLY", true, "IME enabled and set", applyStart));

    const verifyStart = now();
    const verifyRes = await adbShell(serial, "settings get secure default_input_method");
    if (!verifyRes.success || verifyRes.stdout.trim() !== imeId) {
      return failWith(
        "VERIFY",
        `[IME] 검증 실패: 현재 IME=${verifyRes.stdout.trim() || verifyRes.stderr}`,
        "VERIFY_FAIL"
      );
    }
    steps.push(stepResult("VERIFY", true, `IME verified: ${imeId}`, verifyStart));
  } else if (presetId === 3) {
    const preStart = now();
    const checkRes = await adbShell(serial, "settings get system accelerometer_rotation");
    if (!checkRes.success) return failWith("PRE_CHECK", "[ROT] settings 조회 실패", "CMD_FAILED");
    steps.push(stepResult("PRE_CHECK", true, `accelerometer_rotation=${checkRes.stdout.trim()}`, preStart));

    const applyStart = now();
    const a = await adbShell(serial, "settings put system accelerometer_rotation 0");
    const b = await adbShell(serial, "settings put system user_rotation 0");
    if (!a.success || !b.success) return failWith("APPLY", `[ROT] 적용 실패: ${a.stderr || b.stderr}`, "CMD_FAILED");
    steps.push(stepResult("APPLY", true, "Rotation lock applied", applyStart));

    const verifyStart = now();
    const va = await adbShell(serial, "settings get system accelerometer_rotation");
    const vb = await adbShell(serial, "settings get system user_rotation");
    if (!va.success || !vb.success || va.stdout.trim() !== "0" || vb.stdout.trim() !== "0") {
      return failWith(
        "VERIFY",
        `[ROT] 검증 실패: accel=${va.stdout.trim()}, rotation=${vb.stdout.trim()}`,
        "VERIFY_FAIL"
      );
    }
    steps.push(stepResult("VERIFY", true, "Rotation verified", verifyStart));
  } else if (presetId === 4) {
    const preStart = now();
    const listRes = await adbShell(serial, "settings list global");
    if (!listRes.success) return failWith("PRE_CHECK", `[CMAS] global settings 조회 실패: ${listRes.stderr}`, "CMD_FAILED");
    const keyRegex = /(cmas|emergency|alert|cell_broadcast)/i;
    const keys = listRes.stdout
      .split(/\r?\n/)
      .map((line) => line.split("=").shift()?.trim() ?? "")
      .filter((key) => key.length > 0 && keyRegex.test(key));
    if (keys.length === 0) {
      severity = "WARN";
      steps.push(
        stepResult(
          "PRE_CHECK",
          true,
          "[CMAS] N/A - 관련 키가 없습니다. 제조사 커스텀 설정일 수 있습니다.",
          preStart
        )
      );
      steps.push(stepResult("RESULT", true, "0/0 keys applicable", now()));
      return { presetId, serial, overallSuccess: true, steps, severity };
    }
    steps.push(stepResult("PRE_CHECK", true, `Found ${keys.length} keys`, preStart));

    const applyStart = now();
    for (const key of keys) {
      const res = await adbShell(serial, `settings put global ${key} 0`);
      if (!res.success) {
        return failWith("APPLY", `[CMAS] ${key} 설정 실패: ${res.stderr}`, "CMD_FAILED");
      }
    }
    steps.push(stepResult("APPLY", true, `Applied ${keys.length} keys`, applyStart));

    const verifyStart = now();
    let verified = 0;
    for (const key of keys) {
      const verify = await adbShell(serial, `settings get global ${key}`);
      if (verify.success && verify.stdout.trim() === "0") {
        verified += 1;
      }
    }
    const partial = verified < keys.length;
    if (partial) {
      severity = "WARN";
      overallSuccess = false;
      pushAlert({
        severity: "WARN",
        serial,
        type: "VERIFY_FAIL",
        message: `[CMAS] 부분 성공: ${verified}/${keys.length}`,
      });
    }
    steps.push(stepResult("VERIFY", !partial, `Verified ${verified}/${keys.length}`, verifyStart));
  } else if (presetId === 5) {
    const preStart = now();
    const serialRes = await adb(["-s", serial, "get-serialno"]);
    if (!serialRes.success || serialRes.stdout.trim() === "unknown") {
      return failWith("PRE_CHECK", "[INV] 시리얼 조회 실패", "CMD_FAILED");
    }
    steps.push(stepResult("PRE_CHECK", true, `serial=${serialRes.stdout.trim()}`, preStart));

    const applyStart = now();
    const ipRes = await adbShell(serial, "ip addr show wlan0");
    const ip = parseIpFromIpAddr(ipRes.stdout);
    if (!ipRes.success || !ip) return failWith("APPLY", "[INV] IP 조회 실패 (WiFi 미연결?)", "CMD_FAILED", "WARN");
    steps.push(stepResult("APPLY", true, `ip=${ip}`, applyStart));

    const verifyStart = now();
    if (!ipv4Regex(ip)) return failWith("VERIFY", `[INV] 유효하지 않은 IP: ${ip}`, "VERIFY_FAIL");
    steps.push(stepResult("VERIFY", true, `ip verified=${ip}`, verifyStart));
    state.devices = state.devices.map((d) => (d.serial === serial ? { ...d, ip } : d));
    sendToRenderer("device:update", state.devices);
  } else if (presetId === 6) {
    const targets: Array<{ ns: "global" | "system"; key: string; value: string; label: string }> = [
      { ns: "global", key: "window_animation_scale", value: "0.0", label: "window_animation_scale" },
      { ns: "global", key: "transition_animation_scale", value: "0.0", label: "transition_animation_scale" },
      { ns: "global", key: "animator_duration_scale", value: "0.0", label: "animator_duration_scale" },
      { ns: "system", key: "screen_off_timeout", value: "2147483647", label: "screen_off_timeout" },
      { ns: "system", key: "screen_brightness_mode", value: "0", label: "screen_brightness_mode" },
      { ns: "system", key: "screen_brightness", value: "255", label: "screen_brightness" },
    ];

    const preStart = now();
    const currentValues = new Map<string, string>();
    for (const target of targets) {
      const res = await adbShell(serial, `settings get ${target.ns} ${target.key}`);
      if (!res.success) return failWith("PRE_CHECK", `[OPT] ${target.label} 조회 실패`, "CMD_FAILED");
      currentValues.set(target.label, res.stdout.trim());
    }
    steps.push(stepResult("PRE_CHECK", true, "Current values fetched", preStart));

    const applyStart = now();
    for (const target of targets) {
      const current = currentValues.get(target.label);
      if (current === target.value) continue;
      const res = await adbShell(serial, `settings put ${target.ns} ${target.key} ${target.value}`);
      if (!res.success) return failWith("APPLY", `[OPT] ${target.label} 적용 실패: ${res.stderr}`, "CMD_FAILED");
    }
    steps.push(stepResult("APPLY", true, "Optimization settings applied", applyStart));

    const verifyStart = now();
    for (const target of targets) {
      const res = await adbShell(serial, `settings get ${target.ns} ${target.key}`);
      const actual = res.stdout.trim();
      if (!res.success || actual !== target.value) {
        return failWith(
          "VERIFY",
          `[OPT] ${target.label} 적용 실패: 기대=${target.value}, 실제=${actual || res.stderr}`,
          "VERIFY_FAIL"
        );
      }
    }
    steps.push(stepResult("VERIFY", true, "Optimization verified", verifyStart));
  } else if (presetId === 7) {
    const outputDir = typeof options?.savePath === "string" && options.savePath.length > 0
      ? options.savePath
      : settingsStore.get("screenshotDir");
    const preStart = now();
    try {
      fs.mkdirSync(outputDir, { recursive: true });
    } catch (error) {
      return failWith(
        "PRE_CHECK",
        `[SHOT] 디렉토리 생성 실패: ${(error as Error).message}`,
        "SCREENSHOT_FAIL"
      );
    }
    steps.push(stepResult("PRE_CHECK", true, `Directory ready: ${outputDir}`, preStart));

    const applyStart = now();
    const stamp = new Date();
    const y = stamp.getFullYear().toString().padStart(4, "0");
    const m = (stamp.getMonth() + 1).toString().padStart(2, "0");
    const d = stamp.getDate().toString().padStart(2, "0");
    const hh = stamp.getHours().toString().padStart(2, "0");
    const mm = stamp.getMinutes().toString().padStart(2, "0");
    const ss = stamp.getSeconds().toString().padStart(2, "0");
    const fileName = `${y}${m}${d}_${hh}${mm}${ss}_${serial}.png`;
    const filePath = path.join(outputDir, fileName);

    const shotRes = await adbBinary(["-s", serial, "exec-out", "screencap", "-p"]);
    if (!shotRes.success || shotRes.stdout.length === 0) {
      return failWith("APPLY", `[SHOT] screencap 실패: ${shotRes.stderr}`, "SCREENSHOT_FAIL");
    }
    fs.writeFileSync(filePath, shotRes.stdout);
    if (!fs.existsSync(filePath)) {
      return failWith("APPLY", "[SHOT] 파일 생성 실패", "SCREENSHOT_FAIL");
    }
    steps.push(stepResult("APPLY", true, `Saved: ${filePath}`, applyStart));

    const verifyStart = now();
    const stat = fs.statSync(filePath);
    const header = fs.readFileSync(filePath).subarray(0, 4).toString("hex").toUpperCase();
    const isPng = header === "89504E47";
    if (stat.size <= 1024 || !isPng) {
      return failWith(
        "VERIFY",
        `[SHOT] 파일 손상: size=${stat.size}bytes, header=${header}`,
        "SCREENSHOT_FAIL"
      );
    }
    steps.push(stepResult("VERIFY", true, `Valid PNG (${stat.size} bytes)`, verifyStart));
  }

  const resultStepStart = now();
  steps.push(stepResult("RESULT", overallSuccess, overallSuccess ? "Success" : "Failed", resultStepStart));
  const level: LogLevel = overallSuccess ? (severity === "WARN" ? "WARN" : "SUCCESS") : "ERROR";
  recordStepLog(level, presetName, "RESULT", serial, overallSuccess ? "Completed" : "Completed with failure");
  return { presetId, serial, overallSuccess, steps, severity };
}

async function executePresetForMany(payload: PresetExecutePayload): Promise<PresetExecuteResponse> {
  const uniqueSerials = [...new Set(payload.serial)].filter(Boolean);
  const results = await Promise.all(
    uniqueSerials.map((serial) =>
      enqueueByDevice(serial, async () => {
        const result = await executePreset(serial, payload.presetId, payload.options);
        addPresetHistory(result);
        return result;
      })
    )
  );
  return { results };
}

function getStoredLaunchAtLogin(): boolean {
  try {
    const data = fs.readFileSync(LAUNCH_AT_LOGIN_FILE, "utf-8");
    const parsed = JSON.parse(data) as { openAtLogin?: boolean };
    return !!parsed.openAtLogin;
  } catch {
    return false;
  }
}

function setStoredLaunchAtLogin(open: boolean): void {
  try {
    fs.mkdirSync(path.dirname(LAUNCH_AT_LOGIN_FILE), { recursive: true });
    fs.writeFileSync(LAUNCH_AT_LOGIN_FILE, JSON.stringify({ openAtLogin: open }));
  } catch (error) {
    log.error("Failed to persist launch-at-login", error);
  }
}

const DEBUG_UI = process.argv.includes("--debug-ui");

function createWindow(): void {
  bootLog("CREATE_WINDOW_ENTER");
  const showImmediately = isDev || DEBUG_UI;
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: showImmediately,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  bootLog(
    `CREATE_WINDOW_CREATED id=${mainWindow.id} osPid=${mainWindow.webContents.getOSProcessId?.() ?? "n/a"}`,
  );

  if (!showImmediately) {
    mainWindow.once("ready-to-show", () => {
      mainWindow?.show();
    });
  }

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
    if (DEBUG_UI) {
      mainWindow.webContents.once("did-finish-load", () => {
        mainWindow?.webContents.openDevTools();
      });
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Application menu: navigation + Agent logs folder
  const sendNavigate = (tab: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app:navigate-tab", tab);
    }
  };
  const menu = Menu.buildFromTemplate([
    {
      label: "View",
      submenu: [
        { label: "Status Board", click: () => sendNavigate("status") },
        { label: "Devices", click: () => sendNavigate("devices") },
        { label: "Logs", click: () => sendNavigate("logs") },
        { label: "채널/컨텐츠", click: () => sendNavigate("channels") },
        { label: "히스토리", click: () => sendNavigate("history") },
        { label: "Settings", click: () => sendNavigate("settings") },
        { type: "separator" },
        {
          label: "Open logs folder",
          click: () => {
            const dir = agentRunner.getAgentLogDir();
            void shell.openPath(dir).then((err) => {
              if (err) log.warn("[Main] openPath logs folder failed:", err);
            });
          },
        },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]);
  Menu.setApplicationMenu(menu);
  bootLog("CREATE_WINDOW_EXIT");
}

async function exportDiagnosticsZip(serials?: string[]): Promise<{ zipPath: string; error?: string; canceled?: boolean }> {
  if (!mainWindow) return { zipPath: "", error: "Main window is not available" };

  const dt = new Date();
  const y = dt.getFullYear().toString().padStart(4, "0");
  const m = (dt.getMonth() + 1).toString().padStart(2, "0");
  const d = dt.getDate().toString().padStart(2, "0");
  const hh = dt.getHours().toString().padStart(2, "0");
  const mm = dt.getMinutes().toString().padStart(2, "0");
  const ss = dt.getSeconds().toString().padStart(2, "0");
  const stamp = `${y}${m}${d}_${hh}${mm}${ss}`;

  const save = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `diagnostic_${stamp}.zip`,
    filters: [{ name: "Zip", extensions: ["zip"] }],
  });
  if (save.canceled || !save.filePath) return { zipPath: "", canceled: true };

  const archiverModule = (await import("archiver")).default as any;

  // Ensure parent directory exists
  const zipDir = path.dirname(save.filePath);
  try {
    fs.mkdirSync(zipDir, { recursive: true });
  } catch {
    return { zipPath: "", error: `Cannot create directory: ${zipDir}` };
  }

  return new Promise((resolve) => {
    const zipPath = save.filePath as string;
    const output = fs.createWriteStream(zipPath);
    const archive = new archiverModule("zip", { zlib: { level: 9 } });

    let settled = false;
    function finish(result: { zipPath: string; error?: string }) {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    }

    archive.on("error", (err?: Error) => finish({ zipPath: "", error: `Archive error: ${err?.message ?? "unknown"}` }));
    output.on("error", (err: NodeJS.ErrnoException) => finish({ zipPath: "", error: `Write error (${err.code}): ${err.message}` }));
    output.on("close", () => {
      finish({ zipPath });
      if (zipPath) {
        try {
          shell.showItemInFolder(zipPath);
        } catch (err) {
          log.warn("[Main] showItemInFolder failed:", err);
        }
      }
    });

    archive.pipe(output);

    void (async () => {
      try {
        const adbVersion = await adb(["version"]);
        archive.append(adbVersion.stdout || adbVersion.stderr, { name: "adb_version.txt" });

        const listRes = await xiaoweiWsRequestOnce({ action: "list" }, 3000);
        if (listRes.success && listRes.stdout) {
          try {
            const mapped = parseXiaoweiListJson(listRes.stdout);
            state.devices = mapped;
            archive.append(JSON.stringify(mapped, null, 2), { name: "adb_devices.txt" });
          } catch {
            archive.append(listRes.stdout, { name: "adb_devices.txt" });
          }
        } else {
          archive.append(`WS list failed: ${listRes.stderr ?? "no response"}`, { name: "adb_devices.txt" });
        }

        const selectedSerials = serials && serials.length > 0 ? serials : state.devices.map((d) => d.serial);
        for (const serial of selectedSerials) {
          const getprop = await adbShell(serial, "getprop");
          archive.append(getprop.stdout || getprop.stderr, { name: `device_${serial}/getprop.txt` });

          const logcat = await adb(["-s", serial, "logcat", "-d", "-t", "500"]);
          archive.append(logcat.stdout || logcat.stderr, { name: `device_${serial}/logcat_last500.txt` });
        }

        const appLogText = state.logBuffer
          .map((entry) => {
            const ts = new Date(entry.timestamp).toISOString();
            return `[${ts}] [${entry.presetName}] [${entry.step}] ${entry.message}`;
          })
          .join("\n");
        archive.append(appLogText, { name: "app_log.txt" });
        archive.append(JSON.stringify(state.presetHistory, null, 2), { name: "preset_history.json" });

        const systemInfo = {
          os: process.platform,
          osRelease: process.getSystemVersion(),
          electronVersion: process.versions.electron,
          appVersion: app.getVersion(),
          appPath: app.getPath("exe"),
          adbPath: resolveAdbPath(),
          deviceControlProvider: DEVICE_CONTROL_PROVIDER,
          xiaoweiWsUrl: XIAOWEI_WS_URL,
        };
        archive.append(JSON.stringify(systemInfo, null, 2), { name: "system_info.json" });

        const agentLogPaths = agentRunner.getAgentLogPaths();
        const maskSensitive = (text: string) =>
          text
            .replace(/(Bearer\s+)[^\s]+/gi, "$1***")
            .replace(/(Authorization:\s*)[^\s]+/gi, "$1***")
            .replace(/(token|api[_-]?key|secret|password)=[^\s&"']+/gi, "$1=***")
            .replace(/(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g, "***JWT***");
        for (const [key, filePath] of Object.entries(agentLogPaths)) {
          try {
            if (fs.existsSync(filePath)) {
              const content = fs.readFileSync(filePath, "utf8");
              archive.append(maskSensitive(content), { name: `logs/agent_${key}.txt` });
            }
          } catch {
            archive.append("(unable to read)", { name: `logs/agent_${key}.txt` });
          }
        }

        await archive.finalize();
      } catch (err) {
        finish({ zipPath: "", error: `Finalize error: ${(err as Error).message}` });
      }
    })();
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("device:list", async () => state.devices);
  ipcMain.handle("preset:execute", async (_e, payload: PresetExecutePayload) => executePresetForMany(payload));
  ipcMain.handle("screenshot:capture", async (_e, payload: { serial: string; savePath?: string }) => {
    const result = await executePreset(payload.serial, 7, { savePath: payload.savePath });
    const verifyStep = result.steps.find((step) => step.step === "APPLY");
    return {
      success: result.overallSuccess,
      filePath: verifyStep?.message.replace("Saved: ", "") ?? "",
      error: result.overallSuccess ? undefined : result.steps.at(-1)?.message,
    };
  });
  ipcMain.handle("diagnostic:export", async (_e, payload?: { serials?: string[] }) =>
    exportDiagnosticsZip(payload?.serials));
  ipcMain.handle("settings:get", async () => settingsStore.store);
  ipcMain.handle("settings:set", async (_e, payload: Partial<AppSettings>) => {
    settingsStore.set(payload);
    return settingsStore.store;
  });
  ipcMain.handle("log:list", async () => state.logBuffer);
  ipcMain.handle("alert:list", async () => state.alertQueue);
  ipcMain.handle("preset:getHistory", async () => state.presetHistory);

  ipcMain.handle("getLaunchAtLogin", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("setLaunchAtLogin", (_e, open: boolean) => {
    app.setLoginItemSettings({ openAtLogin: open });
    setStoredLaunchAtLogin(open);
  });

  ipcMain.handle("agent:getState", () => agentRunner.getAgentState());
  ipcMain.handle("agent:getSettings", () => getAgentSettings());
  ipcMain.handle("agent:setSettings", (_e, payload: AgentSettings) => setAgentSettings(payload));
  ipcMain.handle("agent:restart", () => {
    agentRunner.restartAgent();
    return agentRunner.getAgentState();
  });
  ipcMain.handle("channels:register", async (_e, payload: { webDashboardUrl: string; handles?: string[]; fetchLatest?: number }) => {
    const base = (payload.webDashboardUrl || "").replace(/\/$/, "");
    if (!base) return { ok: false, error: "web_dashboard_url required" };
    const url = `${base}/api/youtube/register-channels`;
    const body = JSON.stringify({
      handles: payload.handles ?? [],
      fetchLatest: payload.fetchLatest ?? 5,
    });
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const text = await res.text();
      if (!res.ok) return { ok: false, error: `${res.status}: ${text}` };
      return { ok: true, data: text ? JSON.parse(text) : undefined };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("pcs:register", async (_e, payload: { webDashboardUrl: string }) => {
    const base = (payload.webDashboardUrl || "").replace(/\/$/, "");
    if (!base) return { ok: false, error: "web_dashboard_url required" };
    const url = `${base}/api/pcs/register`;
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" } });
      const data = (await res.json()) as { ok?: boolean; pc_number?: string; error?: string };
      if (!res.ok) return { ok: false, error: data.error ?? `${res.status}` };
      return { ok: true, pc_number: data.pc_number ?? null, error: data.error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle("getAppPath", () => app.getPath("exe"));
  ipcMain.handle("getSupabaseConfig", () => ({
    url: process.env.SUPABASE_URL ?? "",
    anonKey: process.env.SUPABASE_ANON_KEY ?? "",
  }));
  ipcMain.handle("agent:openLogsFolder", () => {
    const dir = agentRunner.getAgentLogDir();
    return shell.openPath(dir).then((err) => (err ? { ok: false, error: err } : { ok: true }));
  });
}

/** Background init after createWindow: log transport, launch-at-login, autoUpdater, IPC, polling, adb, agent, agent:state interval. */
function startBackgroundInit(): void {
  (async () => {
    log.transports.file.resolvePathFn = () => path.join(app.getPath("userData"), "logs", "desktop.log");
    log.transports.file.maxSize = 5 * 1024 * 1024;

    const stored = getStoredLaunchAtLogin();
    app.setLoginItemSettings({ openAtLogin: stored });

    if (!isDev && app.isPackaged) {
      try {
        autoUpdater.setFeedURL({
          provider: "github",
          owner: "doai-me",
          repo: "doai.me",
        });
      } catch {
        // no-op
      }
    }

    registerIpcHandlers();
    agentRunner.setXiaoweiReadyCheck(IS_WS_ONLY_PROVIDER ? () => true : () => state.adbHealthy);
    startDevicePolling();

    if (!IS_WS_ONLY_PROVIDER) {
      const adbStart = await adb(["start-server"]);
      if (!adbStart.success) {
        pushAlert({
          severity: "ERROR",
          type: "ADB_DOWN",
          message: `adb start-server failed: ${adbStart.stderr}`,
        });
      }
    }

    if (process.platform === "win32") {
      bootLog("BOOT_3 agentRunner start");
      const agentEnv: Record<string, string> = {
        ...getAgentEnv(),
        AGENT_WS_STATUS_FILE: path.join(app.getPath("userData"), "agent-ws-status.json"),
        AGENT_DEVICES_FILE: path.join(app.getPath("userData"), "agent-devices.json"),
      };
      logAgentEnvMasked(agentEnv);
      const hasSupabase = !!(agentEnv.SUPABASE_URL?.trim() && agentEnv.SUPABASE_ANON_KEY?.trim());
      if (!hasSupabase) log.warn("[Main] Agent may exit: set SUPABASE_URL and SUPABASE_ANON_KEY in resources/.env or resources/agent/.env (packaged) or .env.local (dev).");
      const started = agentRunner.startAgent(agentEnv);
      if (!started) {
        log.error("[Main] Embedded agent failed to start; check agent path and Node.");
      }
    }

    setInterval(() => {
      const w = BrowserWindow.getAllWindows()[0];
      if (w && !w.isDestroyed()) {
        const agentState = agentRunner.getAgentState();
        const lastPreset = state.presetHistory[state.presetHistory.length - 1] ?? null;
        w.webContents.send("agent:state", { ...agentState, lastPresetResult: lastPreset });
      }
    }, 2000);
  })().catch((err) => {
    bootLogError("whenReady setImmediate error", err);
    log.error("[Main] Background init error", err);
  });
}
