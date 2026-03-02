import { execFile } from "child_process";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import Store from "electron-store";
import log from "electron-log";
import { autoUpdater } from "electron-updater";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import * as agentRunner from "./agentRunner";

const execFileAsync = promisify(execFile);
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const PRELOAD_PATH = path.join(__dirname, "../preload/preload.js");
const LAUNCH_AT_LOGIN_FILE = path.join(app.getPath("userData"), "launch-at-login.json");
const DEVICE_CONTROL_PROVIDER = process.env.DEVICE_CONTROL_PROVIDER ?? "xiaowei_api";
const XIAOWEI_API_URL = process.env.XIAOWEI_API_URL ?? "http://127.0.0.1:22600/command";

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

interface XiaoweiEnvelope {
  code?: number;
  message?: string;
  data?: unknown;
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

async function xiaoweiRequest(
  action: string,
  devices?: string,
  data?: Record<string, unknown>,
  timeout = COMMAND_TIMEOUT_MS
): Promise<ExecResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const payload: Record<string, unknown> = { action };
    if (devices) payload.devices = devices;
    if (data) payload.data = data;

    const response = await fetch(XIAOWEI_API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return {
        success: false,
        stdout: "",
        stderr: `Xiaowei API ${response.status}: ${response.statusText}`,
        timedOut: false,
      };
    }

    const body = await response.text();
    let parsed: XiaoweiEnvelope | null = null;
    try {
      parsed = JSON.parse(body) as XiaoweiEnvelope;
    } catch {
      // plain text response
    }

    if (!parsed) {
      return { success: true, stdout: body, stderr: "", timedOut: false };
    }

    if (typeof parsed.code === "number" && parsed.code !== 10000) {
      return {
        success: false,
        stdout: "",
        stderr: `Xiaowei code=${parsed.code} message=${parsed.message ?? ""}`,
        timedOut: false,
      };
    }

    const stdout =
      typeof parsed.data === "string"
        ? parsed.data
        : parsed.data == null
          ? body
          : JSON.stringify(parsed.data);

    return { success: true, stdout, stderr: "", timedOut: false };
  } catch (error) {
    const err = error as Error;
    const timedOut = err.name === "AbortError";
    return {
      success: false,
      stdout: "",
      stderr: timedOut ? "Xiaowei API timeout" : err.message,
      timedOut,
    };
  }
}

function parseAdbArgs(args: string[]): { devices?: string; command: string } {
  if (args[0] === "-s" && args.length >= 3) {
    return { devices: args[1], command: args.slice(2).join(" ") };
  }
  return { command: args.join(" ") };
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
  if (DEVICE_CONTROL_PROVIDER === "xiaowei_api") {
    const parsed = parseAdbArgs(args);
    return xiaoweiRequest("adb", parsed.devices, { command: parsed.command }, timeout);
  }
  return runCommand(resolveAdbPath(), args, timeout);
}

async function adbBinary(args: string[], timeout = COMMAND_TIMEOUT_MS): Promise<ExecBufferResult> {
  if (DEVICE_CONTROL_PROVIDER === "xiaowei_api") {
    const parsed = parseAdbArgs(args);
    const result = await xiaoweiRequest("adb", parsed.devices, { command: parsed.command }, timeout);
    return {
      success: result.success,
      stdout: Buffer.from(result.stdout ?? "", "utf8"),
      stderr: result.stderr,
      timedOut: result.timedOut,
    };
  }
  return runCommandBinary(resolveAdbPath(), args, timeout);
}

async function adbShell(serial: string, command: string, timeout = COMMAND_TIMEOUT_MS): Promise<ExecResult> {
  if (DEVICE_CONTROL_PROVIDER === "xiaowei_api") {
    return xiaoweiRequest("adb_shell", serial, { command }, timeout);
  }
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
  const adbHealth = DEVICE_CONTROL_PROVIDER === "xiaowei_api"
    ? await xiaoweiRequest("list", undefined, undefined, COMMAND_TIMEOUT_WARN_MS)
    : await adb(["version"], COMMAND_TIMEOUT_WARN_MS);
  const healthy = adbHealth.success;
  if (!healthy && state.adbHealthy) {
    pushAlert({
      severity: "ERROR",
      type: "ADB_DOWN",
      message: adbHealth.stderr || "ADB did not respond to adb version",
    });
  }
  state.adbHealthy = healthy;

  const devicesRes = await adb(["devices", "-l"]);
  if (!devicesRes.success) {
    if (DEVICE_CONTROL_PROVIDER === "xiaowei_api") {
      const listRes = await xiaoweiRequest("list");
      if (listRes.success) {
        try {
          const data = JSON.parse(listRes.stdout) as Array<{
            serial?: string;
            onlySerial?: string;
            model?: string;
            status?: string;
          }>;
          state.devices = data.map((d) => ({
            serial: d.serial || d.onlySerial || "",
            model: d.model,
            state: (d.status === "offline" ? "offline" : "device") as DeviceState,
          }));
          sendToRenderer("device:update", state.devices);
          return;
        } catch {
          // continue to generic error path
        }
      }
    }
    pushLog({
      level: "ERROR",
      presetName: "SYSTEM",
      step: "PRE_CHECK",
      message: `adb devices failed: ${devicesRes.stderr}`,
    });
    return;
  }

  const parsed = parseDevices(devicesRes.stdout);
  if (parsed.length === 0 && DEVICE_CONTROL_PROVIDER === "xiaowei_api") {
    const listRes = await xiaoweiRequest("list");
    if (listRes.success) {
      try {
        const data = JSON.parse(listRes.stdout) as Array<{
          serial?: string;
          onlySerial?: string;
          model?: string;
          status?: string;
        }>;
        const mapped = data.map((d) => ({
          serial: d.serial || d.onlySerial || "",
          model: d.model,
          state: (d.status === "offline" ? "offline" : "device") as DeviceState,
        }));
        state.devices = mapped;
        sendToRenderer("device:update", state.devices);
        return;
      } catch {
        // ignore parse fallback
      }
    }
  }
  const hydrated = await Promise.all(parsed.map(fetchDeviceDetails));
  state.devices = hydrated;
  sendToRenderer("device:update", state.devices);

  const unauthorized = hydrated.filter((d) => d.state === "unauthorized").length;
  if (unauthorized > previousUnauthorizedCount) {
    pushAlert({
      severity: unauthorized >= 3 ? "ERROR" : "WARN",
      type: "UNAUTHORIZED",
      message: `Unauthorized devices increased: ${previousUnauthorizedCount} -> ${unauthorized}`,
    });
  }
  previousUnauthorizedCount = unauthorized;
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

    if (DEVICE_CONTROL_PROVIDER === "xiaowei_api") {
      const screenRes = await xiaoweiRequest("screen", serial, { savePath: outputDir });
      if (!screenRes.success) {
        return failWith("APPLY", `[SHOT] screen 실패: ${screenRes.stderr}`, "SCREENSHOT_FAIL");
      }
      if (!fs.existsSync(filePath)) {
        const newest = fs
          .readdirSync(outputDir)
          .filter((f) => f.toLowerCase().endsWith(".png"))
          .map((f) => ({ path: path.join(outputDir, f), mtime: fs.statSync(path.join(outputDir, f)).mtimeMs }))
          .sort((a, b) => b.mtime - a.mtime)[0];
        if (newest?.path) {
          fs.copyFileSync(newest.path, filePath);
        }
      }
    } else {
      const shotRes = await adbBinary(["-s", serial, "exec-out", "screencap", "-p"]);
      if (!shotRes.success || shotRes.stdout.length === 0) {
        return failWith("APPLY", `[SHOT] screencap 실패: ${shotRes.stderr}`, "SCREENSHOT_FAIL");
      }
      fs.writeFileSync(filePath, shotRes.stdout);
    }
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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
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

  const archiverModule = (await import("archiver")).default;
  return new Promise(async (resolve) => {
    const output = fs.createWriteStream(save.filePath);
    const archive = archiverModule("zip", { zlib: { level: 9 } });
    archive.pipe(output);

    const adbVersion = await adb(["version"]);
    archive.append(adbVersion.stdout || adbVersion.stderr, { name: "adb_version.txt" });

    const adbDevices = await adb(["devices", "-l"]);
    archive.append(adbDevices.stdout || adbDevices.stderr, { name: "adb_devices.txt" });

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
      xiaoweiApiUrl: XIAOWEI_API_URL,
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

    archive.on("error", (error?: Error) => {
      resolve({ zipPath: "", error: error?.message ?? "archive error" });
    });
    output.on("close", () => resolve({ zipPath: save.filePath ?? "" }));
    await archive.finalize();
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

  ipcMain.handle("getLaunchAtLogin", () => app.getLoginItemSettings().openAtLogin);
  ipcMain.handle("setLaunchAtLogin", (_e, open: boolean) => {
    app.setLoginItemSettings({ openAtLogin: open });
    setStoredLaunchAtLogin(open);
  });

  ipcMain.handle("agent:getState", () => agentRunner.getAgentState());
  ipcMain.handle("agent:restart", () => {
    agentRunner.restartAgent();
    return agentRunner.getAgentState();
  });
  ipcMain.handle("getAppPath", () => app.getPath("exe"));
}

process.on("uncaughtException", (error) => {
  log.error("uncaughtException", error);
});

process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection", reason);
});

app.whenReady().then(async () => {
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

  if (DEVICE_CONTROL_PROVIDER !== "xiaowei_api") {
    const adbStart = await adb(["start-server"]);
    if (!adbStart.success) {
      pushAlert({
        severity: "ERROR",
        type: "ADB_DOWN",
        message: `adb start-server failed: ${adbStart.stderr}`,
      });
    }
  } else {
    const ping = await xiaoweiRequest("list");
    if (!ping.success) {
      pushAlert({
        severity: "ERROR",
        type: "ADB_DOWN",
        message: `Xiaowei API 연결 실패: ${ping.stderr}`,
      });
    }
  }

  registerIpcHandlers();
  createWindow();
  startDevicePolling();
  if (process.platform === "win32") {
    const started = agentRunner.startAgent();
    if (!started) {
      log.error("[Main] Embedded agent failed to start; check agent path and Node.");
    }
  }
});

app.on("before-quit", async () => {
  agentRunner.stopAgent();
  stopDevicePolling();
  if (DEVICE_CONTROL_PROVIDER !== "xiaowei_api") {
    await adb(["kill-server"]);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow === null) createWindow();
});
