#!/bin/bash
set -e
cd "$(dirname "$0")/.." 2>/dev/null || true

# Fix 1: xiaowei-client.ts
echo "[1/2] Updating xiaowei-client.ts..."
cp agent/src/xiaowei-client.ts agent/src/xiaowei-client.ts.bak 2>/dev/null || true
cat > agent/src/xiaowei-client.ts << 'XEOF'
import { EventEmitter } from "events";
import WebSocket from "ws";
import { getLogger } from "./logger";

const log = getLogger("Xiaowei");

// ============================================================
// Xiaowei (效卫投屏) WebSocket Client — Full 31 API Support
// API Docs: https://www.xiaowei.xin/help/
// Protocol: ws://127.0.0.1:22222/ (Android)
// ============================================================

// ── Types ──────────────────────────────────────────────────

export interface XiaoweiDevice {
  serial: string;
  onlySerial: string;
  name: string;
  model: string;
  mode: number; // 0=USB, 1=WiFi, 2=OTG, 3=Accessibility, 10~12=Cloud
  sort: number;
  hide: boolean;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  connectTime: number;
  intranetIp: string;
  battery?: number;
  screenOn?: boolean;
  status?: string;
}

export interface XiaoweiResponse {
  code: number;
  message?: string;
  data?: unknown;
  [key: string]: unknown;
}

/** adb / adb_shell 응답: { "serial1": "output", "serial2": "output" } */
export type AdbResultMap = Record<string, string>;

export interface XiaoweiTag {
  name: string;
  ids: string[];
  ident: string;
}

/** pointerEvent type codes — x,y는 0~100 백분율 */
export enum PointerType {
  PRESS = "0",
  RELEASE = "1",
  MOVE = "2",
  SCROLL_UP = "4",
  SCROLL_DOWN = "5",
  SWIPE_UP = "6",
  SWIPE_DOWN = "7",
  SWIPE_LEFT = "8",
  SWIPE_RIGHT = "9",
}

/** pushEvent type codes */
export enum PushType {
  RECENT_APPS = "1",
  HOME = "2",
  BACK = "3",
}

interface PendingRequest {
  resolve: (value: XiaoweiResponse) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  action: string;
}

interface TaskOptions {
  count?: number;
  startTimes?: string[]; // "YYYY-MM-DD HH:mm:ss"
  taskInterval?: [number, number]; // [min, max] ms
  deviceInterval?: string | number; // ms
}

const XIAOWEI_SUCCESS = 10000;

// ── Client ─────────────────────────────────────────────────

export class XiaoweiClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private _connected = false;
  private shouldReconnect = true;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly pending = new Map<number, PendingRequest>();
  private requestId = 0;
  public lastDevices: XiaoweiDevice[] = [];

  constructor(private readonly wsUrl: string) {
    super();
  }

  get connected(): boolean {
    return this._connected;
  }

  // ── Connection Management ──────────────────────────────

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    log.info(`Connecting to ${this.wsUrl}`);

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      log.error("Connection error", { error: (err as Error).message });
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      log.info("Connected");
      this._connected = true;
      this.reconnectDelay = 1000;
      this.emit("connected");
    });

    this.ws.on("message", (raw: WebSocket.Data) => {
      try {
        const msg = JSON.parse(raw.toString()) as XiaoweiResponse;
        this.emit("response", msg);
        if (this.pending.size > 0) {
          const [id, req] = this.pending.entries().next().value as [number, PendingRequest];
          this.pending.delete(id);
          clearTimeout(req.timer);
          req.resolve(msg);
        }
      } catch (err) {
        log.error("Failed to parse message", { error: (err as Error).message });
      }
    });

    this.ws.on("close", () => {
      const was = this._connected;
      this._connected = false;
      if (was) {
        log.warn("Disconnected");
        this.emit("disconnected");
      }
      this.rejectAllPending("WebSocket disconnected");
      this.scheduleReconnect();
    });

    this.ws.on("error", (err: Error) => {
      log.error("WebSocket error", { error: err.message });
      this.emit("error", err);
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.rejectAllPending("Client disconnecting");
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    log.info("Disconnected by client");
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    log.info(`Reconnecting in ${this.reconnectDelay / 1000}s`);
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  private rejectAllPending(reason: string): void {
    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
      req.reject(new Error(reason));
    }
    this.pending.clear();
  }

  // ── Core Send ──────────────────────────────────────────

  send(message: Record<string, unknown>, timeout = 30000): Promise<XiaoweiResponse> {
    return new Promise((resolve, reject) => {
      if (!this._connected || !this.ws) {
        return reject(new Error("Not connected to Xiaowei"));
      }

      const id = ++this.requestId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${message.action}`));
      }, timeout);

      this.pending.set(id, {
        resolve,
        reject,
        timer,
        action: String(message.action || "unknown"),
      });

      try {
        this.ws.send(JSON.stringify(message));
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  private checkResponse(resp: XiaoweiResponse, action: string): void {
    if (resp.code !== XIAOWEI_SUCCESS) {
      log.warn(`${action} failed [${resp.code}]: ${resp.message || "unknown"}`);
    }
  }

  // ════════════════════════════════════════════════════════
  // 3.1 장치 관리 API
  // ════════════════════════════════════════════════════════

  /** #1 list — 연결된 기기 목록 조회 */
  async list(): Promise<XiaoweiDevice[]> {
    const resp = await this.send({ action: "list" });
    const devices = Array.isArray(resp.data) ? (resp.data as XiaoweiDevice[]) : [];
    this.lastDevices = devices;
    return devices;
  }

  /** #2 updateDevices — 기기 이름/정렬번호 수정 */
  async updateDevices(
    devices: string,
    data: { sort?: number; name?: string }
  ): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "updateDevices", devices, data });
    this.checkResponse(resp, "updateDevices");
    return resp;
  }

  // ════════════════════════════════════════════════════════
  // 3.2 ADB 명령 API
  // ════════════════════════════════════════════════════════

  /**
   * #3 adb — 전체 ADB 명령 실행
   * command에 "adb" 접두사 포함 필요
   * 예: "adb shell getprop ro.product.model"
   * 예: "adb exec-out ip addr show wlan0"
   */
  async adb(devices: string, command: string): Promise<AdbResultMap> {
    const resp = await this.send({
      action: "adb",
      devices,
      data: { command },
    });
    this.checkResponse(resp, "adb");
    return (resp.data as AdbResultMap) ?? {};
  }

  /**
   * #25 adb_shell — ADB Shell 명령 실행 (v8.288+)
   * "adb shell" 이후 부분만 전달
   * 예: "getprop ro.product.model"
   * 예: "input keyevent KEYCODE_VOLUME_UP"
   */
  async adbShell(devices: string, command: string): Promise<AdbResultMap> {
    const resp = await this.send({
      action: "adb_shell",
      devices,
      data: { command },
    });
    this.checkResponse(resp, "adb_shell");
    return (resp.data as AdbResultMap) ?? {};
  }

  // ════════════════════════════════════════════════════════
  // 3.3 화면 제어 API
  // ════════════════════════════════════════════════════════

  /** #4 screen — 스크린샷 */
  async screen(devices: string, savePath?: string): Promise<XiaoweiResponse> {
    const data: Record<string, string> = {};
    if (savePath) data.savePath = savePath;
    return this.send({ action: "screen", devices, data });
  }

  /**
   * #5 pointerEvent — 화면 터치 제어
   * x, y: 0~100 백분율 (좌표가 필요한 type만)
   */
  async pointerEvent(
    devices: string,
    type: PointerType | string,
    x?: number,
    y?: number
  ): Promise<XiaoweiResponse> {
    const data: Record<string, string> = { type: String(type) };
    if (x !== undefined) data.x = String(x);
    if (y !== undefined) data.y = String(y);
    const resp = await this.send({ action: "pointerEvent", devices, data });
    this.checkResponse(resp, "pointerEvent");
    return resp;
  }

  /** #6 pushEvent — 빠른 작동 (홈/뒤로/최근앱) */
  async pushEvent(devices: string, type: PushType | string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "pushEvent",
      devices,
      data: { type: String(type) },
    });
    this.checkResponse(resp, "pushEvent");
    return resp;
  }

  // ── 편의 메서드 ────────────────────────────────────────

  async goHome(devices: string): Promise<XiaoweiResponse> {
    return this.pushEvent(devices, PushType.HOME);
  }

  async goBack(devices: string): Promise<XiaoweiResponse> {
    return this.pushEvent(devices, PushType.BACK);
  }

  async recentApps(devices: string): Promise<XiaoweiResponse> {
    return this.pushEvent(devices, PushType.RECENT_APPS);
  }

  /** 탭 = press + 짧은 대기 + release */
  async tap(devices: string, x: number, y: number): Promise<void> {
    await this.pointerEvent(devices, PointerType.PRESS, x, y);
    await new Promise((r) => setTimeout(r, 50));
    await this.pointerEvent(devices, PointerType.RELEASE, x, y);
  }

  async swipeUp(devices: string): Promise<XiaoweiResponse> {
    return this.pointerEvent(devices, PointerType.SWIPE_UP);
  }

  async swipeDown(devices: string): Promise<XiaoweiResponse> {
    return this.pointerEvent(devices, PointerType.SWIPE_DOWN);
  }

  // ════════════════════════════════════════════════════════
  // 3.4 클립보드 · 텍스트 입력 API
  // ════════════════════════════════════════════════════════

  /** #7 writeClipBoard — 클립보드에 텍스트 전송 */
  async writeClipBoard(devices: string, content: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "writeClipBoard",
      devices,
      data: { content },
    });
    this.checkResponse(resp, "writeClipBoard");
    return resp;
  }

  /** #18 inputText — 텍스트 입력 (투핑 입력기 활성화 필요) */
  async inputText(devices: string, content: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "inputText",
      devices,
      data: { content },
    });
    this.checkResponse(resp, "inputText");
    return resp;
  }

  // ════════════════════════════════════════════════════════
  // 3.5 파일 관리 API
  // ════════════════════════════════════════════════════════

  /** #8 uploadFile — PC → 모바일 파일 전송 */
  async uploadFile(
    devices: string,
    filePath: string,
    isMedia: "0" | "1" = "0"
  ): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "uploadFile",
      devices,
      data: { filePath, isMedia },
    });
    this.checkResponse(resp, "uploadFile");
    return resp;
  }

  /** #9 pullFile — 모바일 → PC 파일 다운로드 */
  async pullFile(
    devices: string,
    filePath: string,
    savePath?: string
  ): Promise<XiaoweiResponse> {
    const data: Record<string, string> = { filePath };
    if (savePath) data.savePath = savePath;
    const resp = await this.send({ action: "pullFile", devices, data });
    this.checkResponse(resp, "pullFile");
    return resp;
  }

  // ════════════════════════════════════════════════════════
  // 3.6 앱(APK) 관리 API
  // ════════════════════════════════════════════════════════

  /** #10 apkList — 설치된 앱 목록 */
  async apkList(devices: string): Promise<XiaoweiResponse> {
    return this.send({ action: "apkList", devices });
  }

  /** #11 installApk — APK 설치 (PC 경로) */
  async installApk(devices: string, filePath: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "installApk",
      devices,
      data: { filePath },
    });
    this.checkResponse(resp, "installApk");
    return resp;
  }

  /** #12 uninstallApk — 앱 제거 */
  async uninstallApk(devices: string, packageName: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "uninstallApk",
      devices,
      data: { apk: packageName },
    });
    this.checkResponse(resp, "uninstallApk");
    return resp;
  }

  /** #13 startApk — 앱 실행 */
  async startApk(devices: string, packageName: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "startApk",
      devices,
      data: { apk: packageName },
    });
    this.checkResponse(resp, "startApk");
    return resp;
  }

  /** #14 stopApk — 앱 강제 종료 */
  async stopApk(devices: string, packageName: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "stopApk",
      devices,
      data: { apk: packageName },
    });
    this.checkResponse(resp, "stopApk");
    return resp;
  }

  // ════════════════════════════════════════════════════════
  // 3.7 입력기(IME) 관리 API
  // ════════════════════════════════════════════════════════

  /** #15 imeList — 설치된 입력기 목록 */
  async imeList(devices: string): Promise<XiaoweiResponse> {
    return this.send({ action: "imeList", devices });
  }

  /** #16 installInputIme — 투핑 전용 입력기 설치 */
  async installInputIme(devices: string): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "installInputIme", devices });
    this.checkResponse(resp, "installInputIme");
    return resp;
  }

  /** #17 selectIme — 입력기 전환 */
  async selectIme(devices: string): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "selectIme", devices });
    this.checkResponse(resp, "selectIme");
    return resp;
  }

  // ════════════════════════════════════════════════════════
  // 3.8 태그(그룹) 관리 API
  // ════════════════════════════════════════════════════════

  /** #19 getTags — 전체 태그 조회 */
  async getTags(): Promise<XiaoweiTag[]> {
    const resp = await this.send({ action: "getTags" });
    return Array.isArray(resp.data) ? (resp.data as XiaoweiTag[]) : [];
  }

  /** #20 addTag — 태그 생성 */
  async addTag(name: string): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "addTag", data: { name } });
    this.checkResponse(resp, "addTag");
    return resp;
  }

  /** #21 updateTag — 태그 이름 변경 */
  async updateTag(data: Record<string, unknown>): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "updateTag", data });
    this.checkResponse(resp, "updateTag");
    return resp;
  }

  /** #22 removeTag — 태그 삭제 */
  async removeTag(data: Record<string, unknown>): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "removeTag", data });
    this.checkResponse(resp, "removeTag");
    return resp;
  }

  /** #23 addTagDevice — 태그에 기기 추가 */
  async addTagDevice(data: Record<string, unknown>): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "addTagDevice", data });
    this.checkResponse(resp, "addTagDevice");
    return resp;
  }

  /** #24 removeTagDevice — 태그에서 기기 제거 */
  async removeTagDevice(data: Record<string, unknown>): Promise<XiaoweiResponse> {
    const resp = await this.send({ action: "removeTagDevice", data });
    this.checkResponse(resp, "removeTagDevice");
    return resp;
  }

  // ════════════════════════════════════════════════════════
  // 3.9 동작(Action) 녹화·실행 API (v8.288+)
  // ════════════════════════════════════════════════════════

  /** #26 actionTasks — 녹화된 동작 목록 조회 */
  async actionTasks(): Promise<XiaoweiResponse> {
    return this.send({ action: "actionTasks" });
  }

  /** #27 actionCreate — 동작 실행 (data는 배열) */
  async actionCreate(
    devices: string,
    actionName: string,
    options: TaskOptions = {}
  ): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "actionCreate",
      devices,
      data: [
        {
          actionName,
          count: options.count ?? 1,
          startTimes: options.startTimes ?? [],
          taskInterval: options.taskInterval ?? [1000, 3000],
          deviceInterval: String(options.deviceInterval ?? "500"),
        },
      ],
    });
    this.checkResponse(resp, "actionCreate");
    return resp;
  }

  /** #28 actionRemove — 실행 중인 동작 중지 */
  async actionRemove(devices: string, name: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "actionRemove",
      devices,
      data: { name },
    });
    this.checkResponse(resp, "actionRemove");
    return resp;
  }

  // ════════════════════════════════════════════════════════
  // 3.10 스크립트(AutoJS) 태스크 API (v8.288+)
  // ════════════════════════════════════════════════════════

  /** #29 autojsTasks — 등록된 스크립트 목록 조회 */
  async autojsTasks(): Promise<XiaoweiResponse> {
    return this.send({ action: "autojsTasks" });
  }

  /**
   * #30 autojsCreate — JS 스크립트 실행 (data는 배열)
   * path: PC 로컬 Windows 경로 (예: "D:\\scripts\\youtube_watch.js")
   */
  async autojsCreate(
    devices: string,
    scriptPath: string,
    options: TaskOptions = {}
  ): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "autojsCreate",
      devices,
      data: [
        {
          path: scriptPath,
          count: options.count ?? 1,
          startTimes: options.startTimes ?? [],
          taskInterval: options.taskInterval ?? [2000, 5000],
          deviceInterval: String(options.deviceInterval ?? "1000"),
        },
      ],
    });
    this.checkResponse(resp, "autojsCreate");
    return resp;
  }

  /** #31 autojsRemove — 실행 중인 스크립트 중지 */
  async autojsRemove(devices: string, name: string): Promise<XiaoweiResponse> {
    const resp = await this.send({
      action: "autojsRemove",
      devices,
      data: { name },
    });
    this.checkResponse(resp, "autojsRemove");
    return resp;
  }
}

XEOF

# Fix 2: agent.ts (remove -e artifact)
echo "[2/2] Re-writing agent.ts (clean)..."
cat > agent/src/agent.ts << 'AEOF'
import * as fs from "fs";
import { loadConfig, AgentConfig } from "./config";
import { initLogger, getLogger } from "./logger";
import { XiaoweiClient, XiaoweiDevice, PointerType, PushType } from "./xiaowei-client";
import { SupabaseSync, TaskRow, JobAssignmentRow } from "./supabase-sync";
import { Broadcaster } from "./broadcaster";

// ============================================================
// DoAi.Me Agent v3.0 — Xiaowei API Direct Control
// No AutoX.js required. YouTube automation via adb_shell + pointerEvent.
// DB: pcs (not workers), jobs + job_assignments, video_executions
// ============================================================

let config: AgentConfig;
let log: ReturnType<typeof getLogger> = getLogger("Agent");
let xiaowei: XiaoweiClient;
let sync: SupabaseSync;
let broadcaster: Broadcaster;
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
let taskPollHandle: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
const runningTasks = new Set<string>();
let prevSerials = new Set<string>();
const errorCountMap = new Map<string, number>();
const ERROR_THRESHOLD = 2;
const CHUNK_SIZE = 5;

// ── Utilities ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Random integer in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Random delay in [min, max] ms */
function randomDelay(min: number, max: number): number {
  return randInt(min, max);
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ── Init ──────────────────────────────────────────────────

async function init(): Promise<void> {
  config = loadConfig();

  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }

  initLogger(config.logsDir);
  log = getLogger("Agent");

  log.info(`Starting Agent v3.0 — PC: ${config.pcNumber}`);
  log.info(`Xiaowei URL: ${config.xiaoweiWsUrl}`);
  log.info(`Heartbeat: ${config.heartbeatInterval}ms, Task poll: ${config.taskPollInterval}ms`);

  // Supabase — register this PC
  sync = new SupabaseSync(config.supabaseUrl, config.supabaseServiceRoleKey);
  await sync.upsertPc(config.pcNumber, require("os").hostname());

  // Broadcaster
  broadcaster = new Broadcaster(sync.getClient(), sync.pcId, config.pcNumber);

  // Xiaowei
  xiaowei = new XiaoweiClient(config.xiaoweiWsUrl);
  xiaowei.on("connected", () => log.info("Xiaowei connected"));
  xiaowei.on("disconnected", () => log.warn("Xiaowei disconnected, reconnecting..."));
  xiaowei.on("error", (err: Error) => log.error("Xiaowei error", { error: err.message }));
  xiaowei.connect();

  // Broadcast task subscription
  sync.subscribeToBroadcast((task) => {
    if (!runningTasks.has(task.id)) {
      executeGenericTask(task);
    }
  });
}

// ── Heartbeat ─────────────────────────────────────────────

async function heartbeat(): Promise<void> {
  try {
    let devices: XiaoweiDevice[] = [];
    if (xiaowei.connected) {
      try {
        devices = await xiaowei.list();
      } catch (err) {
        log.error("Failed to list devices", { error: (err as Error).message });
      }
    }

    const currentSerials = new Set(devices.map((d) => d.serial));

    // Detect disappeared devices
    const errorSerials: string[] = [];
    for (const serial of prevSerials) {
      if (!currentSerials.has(serial)) {
        if (xiaowei.connected) {
          const count = (errorCountMap.get(serial) || 0) + 1;
          errorCountMap.set(serial, count);
          if (count < ERROR_THRESHOLD) errorSerials.push(serial);
        }
      }
    }

    // Clear error counts for returned devices
    for (const serial of currentSerials) {
      errorCountMap.delete(serial);
    }

    // Cleanup exceeded thresholds
    for (const [serial, count] of errorCountMap) {
      if (count >= ERROR_THRESHOLD) errorCountMap.delete(serial);
    }

    prevSerials = currentSerials;

    // Sync to DB
    await sync.updatePcHeartbeat(devices.length, xiaowei.connected);
    await sync.syncDevices(devices, errorSerials);

    // Broadcast
    await broadcaster.broadcastPcHeartbeat(devices.length, xiaowei.connected);
    await broadcaster.broadcastPcDevices(devices);

    const errorInfo = errorSerials.length > 0 ? `, ${errorSerials.length} error` : "";
    log.info(`Heartbeat OK — ${devices.length} device(s), xiaowei=${xiaowei.connected}${errorInfo}`);
  } catch (err) {
    log.error("Heartbeat error", { error: (err as Error).message });
  }
}

function startHeartbeat(): void {
  heartbeat();
  heartbeatHandle = setInterval(heartbeat, config.heartbeatInterval);
}

// ── Task Polling ──────────────────────────────────────────

async function pollTasks(): Promise<void> {
  try {
    // 1. Poll generic tasks (ADB commands, scripts, etc.)
    const tasks = await sync.fetchPendingTasks();
    for (const task of tasks) {
      if (!runningTasks.has(task.id)) {
        executeGenericTask(task);
      }
    }

    // 2. Poll job assignments (YouTube watch tasks)
    const assignments = await sync.fetchPendingJobAssignments();
    for (const assignment of assignments) {
      if (!runningTasks.has(assignment.id)) {
        executeYouTubeJob(assignment);
      }
    }
  } catch (err) {
    log.error("Task poll error", { error: (err as Error).message });
  }
}

function startTaskPolling(): void {
  pollTasks();
  taskPollHandle = setInterval(pollTasks, config.taskPollInterval);
}

// ══════════════════════════════════════════════════════════
// YouTube 시청 — Xiaowei API 직접 제어 (AutoX.js 불필요)
// ══════════════════════════════════════════════════════════

async function watchVideoOnDevice(
  serial: string,
  videoUrl: string,
  durationSec: number,
  options: {
    probLike?: number;
    probComment?: number;
    probSubscribe?: number;
  } = {}
): Promise<{
  actualDurationSec: number;
  watchPercentage: number;
  didLike: boolean;
  didComment: boolean;
}> {
  const startTime = Date.now();
  let didLike = false;
  let didComment = false;

  // 1. Open video URL directly via intent
  log.info(`[${serial}] Opening: ${videoUrl}`);
  await xiaowei.adbShell(serial,
    `am start -a android.intent.action.VIEW -d '${videoUrl}'`);

  // 2. Wait for video to load
  await sleep(randomDelay(4000, 7000));

  // 3. Tap center to dismiss any overlays / start playback
  await xiaowei.tap(serial, 50, 50);
  await sleep(1000);

  // 4. Watch with natural human behavior
  const targetMs = durationSec * 1000;
  let elapsed = 0;

  while (elapsed < targetMs && !shuttingDown) {
    const waitMs = randomDelay(10000, 40000);
    const actualWait = Math.min(waitMs, targetMs - elapsed);
    await sleep(actualWait);
    elapsed += actualWait;

    // Random natural actions
    const roll = Math.random();
    if (roll < 0.15) {
      // Brief pause/resume — tap player area
      await xiaowei.tap(serial, 50 + randInt(-10, 10), 40 + randInt(-5, 5));
      await sleep(randomDelay(500, 1500));
      await xiaowei.tap(serial, 50, 40); // tap again to resume
    } else if (roll < 0.25) {
      // Scroll down slightly (peek at comments/description)
      await xiaowei.pointerEvent(serial, PointerType.SWIPE_UP);
      await sleep(randomDelay(2000, 5000));
      await xiaowei.pointerEvent(serial, PointerType.SWIPE_DOWN);
    } else if (roll < 0.30) {
      // Small random position adjustment
      await xiaowei.tap(serial, randInt(20, 80), randInt(30, 50));
      await sleep(500);
    }
    // else: do nothing (most common — just watch)
  }

  // 5. Optional: Like
  if ((options.probLike ?? 0) > 0 && Math.random() * 100 < (options.probLike ?? 0)) {
    try {
      // Scroll to see like button, then tap
      // Like button is typically at ~15% x, ~60% y on YouTube
      await xiaowei.tap(serial, 15, 60);
      didLike = true;
      log.info(`[${serial}] Liked video`);
      await sleep(randomDelay(1000, 2000));
    } catch {
      log.warn(`[${serial}] Like action failed`);
    }
  }

  // 6. Go home to clean up
  await xiaowei.goHome(serial);
  await sleep(500);

  const actualDurationSec = Math.round((Date.now() - startTime) / 1000);
  const watchPercentage = durationSec > 0
    ? Math.min(100, Math.round((actualDurationSec / durationSec) * 100))
    : 0;

  return { actualDurationSec, watchPercentage, didLike, didComment };
}

async function executeYouTubeJob(assignment: JobAssignmentRow): Promise<void> {
  if (runningTasks.size >= config.maxConcurrentTasks) return;
  runningTasks.add(assignment.id);

  log.info(`YouTube job: ${assignment.id} (job: ${assignment.job_id})`);

  try {
    if (!xiaowei.connected) throw new Error("Xiaowei not connected");

    // Mark running
    await sync.updateJobAssignment(assignment.id, "running");

    // Get job details
    const job = (assignment as unknown as { jobs: Record<string, unknown> }).jobs as {
      target_url: string;
      duration_sec: number;
      duration_min_pct: number;
      duration_max_pct: number;
      prob_like: number;
      prob_comment: number;
    } | undefined;

    if (!job?.target_url) throw new Error("No target_url in job");

    // Calculate watch duration
    const minDuration = Math.round(job.duration_sec * job.duration_min_pct / 100);
    const maxDuration = Math.round(job.duration_sec * job.duration_max_pct / 100);
    const watchDuration = randInt(minDuration, maxDuration);

    // Get device serial
    const serial = assignment.device_serial;
    if (!serial) throw new Error("No device_serial in assignment");

    // Execute watch
    const result = await watchVideoOnDevice(serial, job.target_url, watchDuration, {
      probLike: job.prob_like,
      probComment: job.prob_comment,
    });

    // Record in video_executions
    const videoId = extractVideoId(job.target_url);
    if (videoId) {
      await sync.insertVideoExecution({
        video_id: videoId,
        device_id: serial,
        status: "completed",
        actual_watch_duration_sec: result.actualDurationSec,
        watch_percentage: result.watchPercentage,
        did_like: result.didLike,
        did_comment: result.didComment,
      });
    }

    // Update assignment
    await sync.updateJobAssignment(assignment.id, "completed", {
      progress_pct: 100,
      watch_percentage: result.watchPercentage,
      final_duration_sec: result.actualDurationSec,
      did_like: result.didLike,
      did_comment: result.didComment,
    });

    log.info(`YouTube job completed: ${assignment.id} — ${result.actualDurationSec}s, ${result.watchPercentage}%`);
  } catch (err) {
    const msg = (err as Error).message;
    log.error(`YouTube job failed: ${assignment.id} — ${msg}`);

    await sync.updateJobAssignment(assignment.id, "failed", {
      error_log: msg,
      error_code: "AGENT_ERROR",
    });

    await sync.insertExecutionLog({
      device_id: assignment.device_serial || undefined,
      level: "error",
      status: "failed",
      message: `YouTube job failed: ${msg}`,
      data: { assignment_id: assignment.id, job_id: assignment.job_id },
    });
  } finally {
    runningTasks.delete(assignment.id);
  }
}

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    return u.searchParams.get("v") || null;
  } catch {
    return null;
  }
}

// ══════════════════════════════════════════════════════════
// 범용 태스크 실행 (ADB, 스크립트, 프리셋 등)
// ══════════════════════════════════════════════════════════

async function executeGenericTask(task: TaskRow): Promise<void> {
  if (runningTasks.size >= config.maxConcurrentTasks) return;
  if (runningTasks.has(task.id)) return;
  runningTasks.add(task.id);

  const taskName = task.task_name;
  log.info(`Executing task ${task.id} (${taskName})`);

  try {
    await sync.updateTaskStatus(task.id, "running");

    if (!xiaowei.connected) throw new Error("Xiaowei not connected");

    const payload = (task.payload ?? {}) as Record<string, unknown>;
    const devices = (payload.devices as string) || "all";
    let result: unknown;

    switch (taskName) {
      case "adb_shell": {
        const command = payload.command as string;
        if (!command) throw new Error("command required");
        result = await xiaowei.adbShell(devices, command);
        break;
      }
      case "adb": {
        const command = payload.command as string;
        if (!command) throw new Error("command required");
        result = await xiaowei.adb(devices, command);
        break;
      }
      case "start_app": {
        const apk = payload.packageName as string || payload.apk as string;
        if (!apk) throw new Error("packageName required");
        result = await xiaowei.startApk(devices, apk);
        break;
      }
      case "stop_app": {
        const apk = payload.packageName as string || payload.apk as string;
        if (!apk) throw new Error("packageName required");
        result = await xiaowei.stopApk(devices, apk);
        break;
      }
      case "install_apk": {
        const filePath = payload.filePath as string;
        if (!filePath) throw new Error("filePath required");
        result = await xiaowei.installApk(devices, filePath);
        break;
      }
      case "screenshot": {
        const savePath = payload.savePath as string;
        result = await xiaowei.screen(devices, savePath);
        break;
      }
      case "push_event": {
        const type = payload.type as string || PushType.HOME;
        result = await xiaowei.pushEvent(devices, type);
        break;
      }
      case "autojsCreate":
      case "run_script": {
        const scriptPath = payload.scriptPath as string || payload.path as string;
        if (!scriptPath) throw new Error("scriptPath required");
        result = await xiaowei.autojsCreate(devices, scriptPath, {
          count: (payload.count as number) ?? 1,
          taskInterval: (payload.taskInterval as [number, number]) ?? [1000, 3000],
          deviceInterval: String(payload.deviceInterval ?? "500"),
        });
        break;
      }
      case "action":
      case "actionCreate": {
        const actionName = payload.actionName as string;
        if (!actionName) throw new Error("actionName required");
        result = await xiaowei.actionCreate(devices, actionName, {
          count: (payload.count as number) ?? 1,
          taskInterval: (payload.taskInterval as [number, number]) ?? [1000, 3000],
          deviceInterval: String(payload.deviceInterval ?? "500"),
        });
        break;
      }
      default:
        throw new Error(`Unknown task: ${taskName}`);
    }

    await sync.updateTaskStatus(task.id, "completed", result as Record<string, unknown>);

    await sync.insertExecutionLog({
      level: "info",
      status: "completed",
      message: `Task completed: ${taskName}`,
      data: { task_id: task.id, result },
    });

    log.info(`Task ${task.id} completed`);
  } catch (err) {
    const message = (err as Error).message;
    log.error(`Task ${task.id} failed: ${message}`);

    await sync.insertExecutionLog({
      level: "error",
      status: "failed",
      message: `Task failed: ${message}`,
      data: { task_id: task.id, task_name: taskName },
    });

    await sync.updateTaskStatus(task.id, "failed", undefined, message);
  } finally {
    runningTasks.delete(task.id);
  }
}

// ── Shutdown ──────────────────────────────────────────────

async function gracefulShutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("Shutting down gracefully...");

  if (taskPollHandle) { clearInterval(taskPollHandle); taskPollHandle = null; }
  if (heartbeatHandle) { clearInterval(heartbeatHandle); heartbeatHandle = null; }

  await sync.unsubscribeAll();
  await broadcaster.cleanup();
  await sync.setPcOffline();
  xiaowei.disconnect();

  log.info("Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (err) => {
  (log ?? console).error(`Uncaught exception: ${err.message}`, { stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  (log ?? console).error(`Unhandled rejection: ${reason}`);
});

// ── Start ─────────────────────────────────────────────────

(async () => {
  try {
    await init();
    startHeartbeat();
    startTaskPolling();
    log.info("Agent v3.0 ready — YouTube via Xiaowei API direct control");
  } catch (err) {
    console.error(`Fatal: ${(err as Error).message}`);
    process.exit(1);
  }
})();

AEOF

echo ""
echo "=== Fixed! ==="
echo "  agent/src/xiaowei-client.ts ($(wc -l < agent/src/xiaowei-client.ts) lines)"
echo "  agent/src/agent.ts ($(wc -l < agent/src/agent.ts) lines)"
echo ""
echo "Now run: cd agent && npx ts-node src/agent.ts"