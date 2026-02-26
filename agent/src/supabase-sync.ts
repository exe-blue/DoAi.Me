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
    // PC 단위 가드레일: 이 PC에 배정된 pending task_device가 있는 task만 가져옴 (다른 PC 태스크를 불러오지 않음)
    const { data: taskIds, error: tdError } = await this.supabase
      .from("task_devices")
      .select("task_id")
      .eq("pc_id", this.pcId)
      .in("status", ["pending"])
      .limit(50);

    if (tdError) {
      log.error("fetchPendingTasks task_devices failed", { error: tdError.message });
      return [];
    }
    const distinctIds = [...new Set((taskIds ?? []).map((r) => r.task_id))];
    if (distinctIds.length === 0) return [];

    const { data, error } = await this.supabase
      .from("tasks")
      .select("*")
      .in("id", distinctIds)
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
