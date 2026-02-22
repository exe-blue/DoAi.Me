#!/bin/bash
# DoAi.Me Agent v3.0 — File updater
# Usage: bash update_agent_v3.sh (run from project root ~/projects/doai.me)

set -e
echo "=== DoAi.Me Agent v3.0 Update ==="

if [ ! -d "agent/src" ]; then
  echo "ERROR: Run from project root (~/projects/doai.me)"
  exit 1
fi

# Backup
echo "[1/6] Backing up..."
cp agent/src/agent.ts agent/src/agent.ts.bak 2>/dev/null || true
cp agent/src/config.ts agent/src/config.ts.bak 2>/dev/null || true
cp agent/src/supabase-sync.ts agent/src/supabase-sync.ts.bak 2>/dev/null || true
cp agent/src/broadcaster.ts agent/src/broadcaster.ts.bak 2>/dev/null || true

# ── .env ────────────────────────────────────────────────
echo "[2/6] Writing agent/.env..."
cat > agent/.env << 'ENV_EOF'
# DoAi.Me Agent v3.0
PC_NUMBER=PC00
SUPABASE_URL=https://vyfxrplzhskncigyfkaz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5ZnhycGx6aHNrbmNpZ3lma2F6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzAxMTMyOSwiZXhwIjoyMDgyNTg3MzI5fQ.CSRg_9dPTxuMMwCSIhyB9Z6Zh4601BRiOy4WAd-yZo0
XIAOWEI_WS_URL=ws://10.0.7.49:22222/
HEARTBEAT_INTERVAL=30000
TASK_POLL_INTERVAL=5000
MAX_CONCURRENT_TASKS=20
ENV_EOF

# ── config.ts ───────────────────────────────────────────
echo "[3/6] Writing agent/src/config.ts..."
cat > agent/src/config.ts << 'CONFIG_EOF'
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
-e 
CONFIG_EOF

echo "[4/6] Writing agent/src/supabase-sync.ts..."
cat > agent/src/supabase-sync.ts << 'SYNC_EOF'
import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { getLogger } from "./logger";
import type { XiaoweiDevice } from "./xiaowei-client";

const log = getLogger("SupabaseSync");

// ============================================================
// Supabase Sync — Matched to REAL DB Schema (2026-02-22)
// Tables: pcs, devices, jobs, job_assignments, video_executions,
//         execution_logs, nodes, tasks, settings
// ============================================================

// ── Status Types (matching DB constraints) ────────────────

type PcStatus = "online" | "offline" | "error";
type DeviceState = "DISCONNECTED" | "IDLE" | "QUEUED" | "RUNNING" | "ERROR" | "QUARANTINE";
type DeviceStatus = "idle" | "busy" | "offline" | "online" | "error";
type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
type JobAssignmentStatus = "pending" | "paused" | "running" | "completed" | "failed" | "cancelled";
type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

// ── Row Interfaces ────────────────────────────────────────

export interface PcRow {
  id: string;
  pc_number: string; // "PC00" ~ "PC04"
  ip_address: string | null;
  hostname: string | null;
  label: string | null;
  status: PcStatus;
  max_devices: number;
  last_heartbeat: string | null;
}

export interface JobRow {
  id: string;
  title: string;
  keyword: string | null;
  video_title: string | null;
  target_url: string;
  video_url: string | null;
  script_type: string;
  duration_sec: number;
  duration_min_pct: number;
  duration_max_pct: number;
  prob_like: number;
  prob_comment: number;
  prob_playlist: number;
  is_active: boolean;
  total_assignments: number;
}

export interface JobAssignmentRow {
  id: string;
  job_id: string;
  device_id: string;
  device_serial: string | null;
  agent_id: string | null;
  status: JobAssignmentStatus;
  progress_pct: number;
  final_duration_sec: number | null;
  watch_percentage: number;
  did_like: boolean;
  did_comment: boolean;
  error_log: string | null;
  error_code: string | null;
  retry_count: number;
}

/** Legacy tasks table — still used for generic/ADB tasks */
export interface TaskRow {
  id: string;
  task_name: string;
  status: string;
  device_id: string | null;
  pc_id: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  progress: number;
  progress_message: string | null;
  // Agent convenience fields (mapped from payload)
  target_devices?: string[];
  target_workers?: string[];
}

export interface InsertExecutionLog {
  execution_id?: string;
  device_id?: string;
  workflow_id?: string;
  step_id?: string;
  level?: LogLevel;
  status?: string;
  message?: string;
  data?: Record<string, unknown>;
  details?: Record<string, unknown>;
  video_id?: string;
  watch_duration_sec?: number;
}

// ── Sync Class ────────────────────────────────────────────

export class SupabaseSync {
  private supabase: SupabaseClient;
  pcId: string = "";         // pcs.id (UUID)
  pcNumber: string = "";     // pcs.pc_number ("PC00")
  private broadcastChannel: RealtimeChannel | null = null;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  // ── pcs 테이블 ──────────────────────────────────────────

  /**
   * PC 등록/업데이트.
   * pcNumber: "PC00" 형식 (DB 체크제약: ^PC[0-9]{2}$)
   */
  async upsertPc(pcNumber: string, hostname?: string): Promise<string> {
    // Try to find existing
    const { data: existing } = await this.supabase
      .from("pcs")
      .select("id, pc_number")
      .eq("pc_number", pcNumber)
      .single();

    if (existing) {
      this.pcId = existing.id;
      this.pcNumber = existing.pc_number;
      await this.supabase
        .from("pcs")
        .update({
          status: "online" as PcStatus,
          hostname: hostname || undefined,
          last_heartbeat: new Date().toISOString(),
        })
        .eq("id", this.pcId);
      log.info(`Found PC: ${this.pcNumber} (${this.pcId})`);
      return this.pcId;
    }

    // Create new
    const { data: created, error } = await this.supabase
      .from("pcs")
      .insert({
        pc_number: pcNumber,
        hostname: hostname || null,
        status: "online" as PcStatus,
        last_heartbeat: new Date().toISOString(),
      })
      .select("id, pc_number")
      .single();

    if (error || !created) {
      throw new Error(`Failed to create PC: ${error?.message}`);
    }

    this.pcId = created.id;
    this.pcNumber = created.pc_number;
    log.info(`Created PC: ${this.pcNumber} (${this.pcId})`);
    return this.pcId;
  }

  async updatePcHeartbeat(deviceCount: number, xiaoweiConnected: boolean): Promise<void> {
    const { error } = await this.supabase
      .from("pcs")
      .update({
        status: "online" as PcStatus,
        last_heartbeat: new Date().toISOString(),
      })
      .eq("id", this.pcId);

    // Also update nodes table if it exists (dashboard reads from nodes)
    await this.supabase
      .from("nodes")
      .upsert({
        id: this.pcNumber,
        name: this.pcNumber,
        status: "online",
        total_devices: deviceCount,
        active_devices: deviceCount,
        last_heartbeat: new Date().toISOString(),
        metadata: { xiaowei_connected: xiaoweiConnected },
      }, { onConflict: "id" })
      .then(({ error: e }) => {
        if (e) log.warn(`nodes upsert: ${e.message}`);
      });

    if (error) {
      log.error("PC heartbeat update failed", { error: error.message });
    }
  }

  async setPcOffline(): Promise<void> {
    if (!this.pcId) return;
    await this.supabase
      .from("pcs")
      .update({ status: "offline" as PcStatus })
      .eq("id", this.pcId);

    await this.supabase
      .from("nodes")
      .update({ status: "offline", active_devices: 0 })
      .eq("id", this.pcNumber);

    log.info("PC set to offline");
  }

  // ── devices 테이블 ──────────────────────────────────────

  /**
   * Xiaowei 디바이스 목록 → DB 동기화
   * 실제 DB 컬럼: serial_number, pc_id, model, status, state, battery_level, last_seen_at 등
   */
  async syncDevices(devices: XiaoweiDevice[], errorSerials?: string[]): Promise<void> {
    const now = new Date().toISOString();
    const activeSerials: string[] = [];
    const errorSet = new Set(errorSerials ?? []);

    for (const d of devices) {
      if (!d.serial) continue;
      activeSerials.push(d.serial);

      const { error } = await this.supabase.from("devices").upsert(
        {
          serial_number: d.serial,
          pc_id: this.pcId,
          model: d.model ?? d.name ?? null,
          model_name: d.name || null,
          status: "online" as DeviceStatus,
          state: "IDLE" as DeviceState,
          battery_level: d.battery ?? null,
          last_seen_at: now,
          last_heartbeat: now,
          metadata: {
            xiaowei_serial: d.onlySerial,
            xiaowei_mode: d.mode,
            source_width: d.sourceWidth,
            source_height: d.sourceHeight,
            intranet_ip: d.intranetIp,
          },
        },
        { onConflict: "serial_number" }
      );

      if (error) {
        log.error(`Device upsert failed: ${d.serial}`, { error: error.message });
      }
    }

    // Mark error devices
    if (errorSet.size > 0) {
      await this.supabase
        .from("devices")
        .update({
          status: "error" as DeviceStatus,
          state: "ERROR" as DeviceState,
          last_seen_at: now,
        })
        .eq("pc_id", this.pcId)
        .in("serial_number", Array.from(errorSet));
    }

    // Mark disappeared devices offline
    const allKnown = [...activeSerials, ...Array.from(errorSet)];
    if (allKnown.length > 0) {
      await this.supabase
        .from("devices")
        .update({
          status: "offline" as DeviceStatus,
          state: "DISCONNECTED" as DeviceState,
          last_seen_at: now,
        })
        .eq("pc_id", this.pcId)
        .not("serial_number", "in", `(${allKnown.join(",")})`)
        .neq("status", "offline");
    }
  }

  // ── jobs + job_assignments (YouTube 시청 태스크) ──────────

  /**
   * 활성 job 중 이 PC의 디바이스에 할당 가능한 것 조회
   */
  async fetchPendingJobAssignments(): Promise<JobAssignmentRow[]> {
    // This PC's device IDs
    const { data: myDevices } = await this.supabase
      .from("devices")
      .select("id, serial_number")
      .eq("pc_id", this.pcId)
      .eq("status", "online");

    if (!myDevices || myDevices.length === 0) return [];

    const deviceIds = myDevices.map((d: { id: string }) => d.id);

    const { data, error } = await this.supabase
      .from("job_assignments")
      .select("*, jobs(*)")
      .in("device_id", deviceIds)
      .in("status", ["pending", "paused"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      log.error("fetchPendingJobAssignments failed", { error: error.message });
      return [];
    }

    return (data ?? []) as JobAssignmentRow[];
  }

  async updateJobAssignment(
    id: string,
    status: JobAssignmentStatus,
    updates?: {
      progress_pct?: number;
      watch_percentage?: number;
      final_duration_sec?: number;
      did_like?: boolean;
      did_comment?: boolean;
      error_log?: string;
      error_code?: string;
    }
  ): Promise<void> {
    const payload: Record<string, unknown> = { status, ...updates };
    if (status === "running") payload.started_at = new Date().toISOString();
    if (status === "completed" || status === "failed") {
      payload.completed_at = new Date().toISOString();
    }

    const { error } = await this.supabase
      .from("job_assignments")
      .update(payload)
      .eq("id", id);

    if (error) {
      log.error(`job_assignment update failed: ${id}`, { error: error.message });
    }
  }

  // ── tasks (레거시 — ADB/스크립트 등 범용 태스크) ─────────

  async fetchPendingTasks(): Promise<TaskRow[]> {
    const { data, error } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("pc_id", this.pcId)
      .in("status", ["pending"])
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      log.error("fetchPendingTasks failed", { error: error.message });
      return [];
    }

    return (data ?? []) as TaskRow[];
  }

  async updateTaskStatus(
    taskId: string,
    status: string,
    result?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === "running") update.started_at = new Date().toISOString();
    if (status === "completed" || status === "failed") {
      update.completed_at = new Date().toISOString();
    }
    if (result !== undefined) update.result = result;
    if (error !== undefined) update.error = error;

    const { error: err } = await this.supabase
      .from("tasks")
      .update(update)
      .eq("id", taskId);

    if (err) {
      log.error(`Task ${taskId} status update failed`, { error: err.message });
    }
  }

  // ── video_executions (시청 이력 기록) ─────────────────────

  async insertVideoExecution(params: {
    video_id: string;
    device_id: string;
    node_id?: string;
    status?: string;
    actual_watch_duration_sec?: number;
    watch_percentage?: number;
    did_like?: boolean;
    did_comment?: boolean;
    did_subscribe?: boolean;
    error_code?: string;
    error_message?: string;
  }): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("video_executions")
      .insert({
        ...params,
        node_id: params.node_id || this.pcNumber,
        status: params.status || "pending",
        execution_date: new Date().toISOString().split("T")[0],
      })
      .select("id")
      .single();

    if (error) {
      log.error("video_executions insert failed", { error: error.message });
      return null;
    }
    return data?.id ?? null;
  }

  async updateVideoExecution(
    id: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.supabase.from("video_executions").update(updates).eq("id", id);
  }

  // ── execution_logs ──────────────────────────────────────

  async insertExecutionLog(params: InsertExecutionLog): Promise<void> {
    const { error } = await this.supabase
      .from("execution_logs")
      .insert({
        ...params,
        created_at: new Date().toISOString(),
      });

    if (error) {
      log.error("execution_logs insert failed", { error: error.message });
    }
  }

  // ── device lookup helpers ──────────────────────────────

  async getDeviceBySerial(serial: string): Promise<{ id: string; serial_number: string } | null> {
    const { data } = await this.supabase
      .from("devices")
      .select("id, serial_number")
      .eq("serial_number", serial)
      .single();
    return data;
  }

  async getMyDeviceSerials(): Promise<string[]> {
    const { data } = await this.supabase
      .from("devices")
      .select("serial_number")
      .eq("pc_id", this.pcId)
      .eq("status", "online");
    return (data ?? []).map((d: { serial_number: string }) => d.serial_number);
  }

  // ── Realtime Broadcast subscription ────────────────────

  subscribeToBroadcast(callback: (task: TaskRow) => void): RealtimeChannel {
    log.info("Subscribing to Broadcast room:tasks");

    this.broadcastChannel = this.supabase
      .channel("room:tasks")
      .on("broadcast", { event: "insert" }, ({ payload }) => {
        const task = (payload as Record<string, unknown>)?.record as TaskRow | undefined;
        if (task && task.pc_id === this.pcId && task.status === "pending") {
          log.info(`[Broadcast] New task: ${task.id}`);
          callback(task);
        }
      })
      .on("broadcast", { event: "update" }, ({ payload }) => {
        const task = (payload as Record<string, unknown>)?.record as TaskRow | undefined;
        if (task && task.pc_id === this.pcId && task.status === "pending") {
          log.info(`[Broadcast] Task updated: ${task.id}`);
          callback(task);
        }
      })
      .subscribe((status) => {
        log.info(`Broadcast room:tasks: ${status}`);
      });

    return this.broadcastChannel;
  }

  async unsubscribeAll(): Promise<void> {
    if (this.broadcastChannel) {
      await this.supabase.removeChannel(this.broadcastChannel);
      this.broadcastChannel = null;
    }
  }
}
-e 
SYNC_EOF

echo "[5/6] Writing agent/src/broadcaster.ts..."
cat > agent/src/broadcaster.ts << 'BROAD_EOF'
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { getLogger } from "./logger";
import type { XiaoweiDevice } from "./xiaowei-client";

const log = getLogger("Broadcaster");

/**
 * Supabase Realtime Broadcaster — matched to pcs/nodes schema
 */
export class Broadcaster {
  private channels = new Map<string, RealtimeChannel>();

  constructor(
    private readonly supabase: SupabaseClient,
    private readonly pcId: string,
    private readonly pcNumber: string
  ) {}

  async broadcastPcDevices(devices: XiaoweiDevice[]): Promise<void> {
    const topic = `room:pc:${this.pcNumber}:devices`;
    await this.sendBroadcast(topic, "update", {
      pc_id: this.pcId,
      pc_number: this.pcNumber,
      devices: devices.map((d) => ({
        serial: d.serial,
        name: d.name,
        model: d.model,
        mode: d.mode,
        battery: d.battery,
        intranetIp: d.intranetIp,
        screenOn: d.screenOn,
      })),
      count: devices.length,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastDeviceBatch(changed: XiaoweiDevice[]): Promise<void> {
    if (changed.length === 0) return;
    await this.sendBroadcast("room:devices", "update", {
      pc_id: this.pcId,
      pc_number: this.pcNumber,
      devices: changed.map((d) => ({
        serial: d.serial,
        status: "online",
        model: d.model,
        battery: d.battery,
      })),
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastPcHeartbeat(deviceCount: number, xiaoweiConnected: boolean): Promise<void> {
    const topic = `room:pc:${this.pcNumber}`;
    await this.sendBroadcast(topic, "heartbeat", {
      pc_id: this.pcId,
      pc_number: this.pcNumber,
      status: "online",
      device_count: deviceCount,
      xiaowei_connected: xiaoweiConnected,
      timestamp: new Date().toISOString(),
    });
  }

  async broadcastTaskProgress(
    taskId: string,
    done: number,
    failed: number,
    total: number
  ): Promise<void> {
    await this.sendBroadcast(`room:task:${taskId}`, "progress", {
      task_id: taskId,
      done,
      failed,
      total,
      timestamp: new Date().toISOString(),
    });
  }

  private async sendBroadcast(
    topic: string,
    event: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      let channel = this.channels.get(topic);
      if (!channel) {
        channel = this.supabase.channel(topic, {
          config: { broadcast: { self: false, ack: true } },
        });
        channel.on("broadcast", { event: "__noop__" }, () => {});
        await new Promise<void>((resolve, reject) => {
          channel!.subscribe((status) => {
            if (status === "SUBSCRIBED") resolve();
            else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              reject(new Error(`Channel failed: ${topic} (${status})`));
            }
          });
        });
        this.channels.set(topic, channel);
      }

      await channel.send({ type: "broadcast", event, payload });
    } catch (err) {
      log.error(`Broadcast failed: ${topic}/${event}`, {
        error: (err as Error).message,
      });
    }
  }

  async cleanup(): Promise<void> {
    for (const [topic, channel] of this.channels) {
      await this.supabase.removeChannel(channel);
      log.info(`Unsubscribed from ${topic}`);
    }
    this.channels.clear();
  }
}
-e 
BROAD_EOF

echo "[6/6] Writing agent/src/agent.ts..."
cat > agent/src/agent.ts << 'AGENT_EOF'
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
-e 
AGENT_EOF

echo ""
echo "=== Update complete! ==="
echo "Updated files:"
echo "  agent/.env"
echo "  agent/src/config.ts"
echo "  agent/src/supabase-sync.ts"
echo "  agent/src/broadcaster.ts"
echo "  agent/src/agent.ts"
echo ""
echo "Next: cd agent && npx ts-node src/agent.ts"