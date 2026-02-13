import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { getLogger } from "./logger";
import type { XiaoweiDevice } from "./xiaowei-client";

const log = getLogger("SupabaseSync");

// Minimal type aliases matching the real DB schema (enums)
type WorkerStatus = "online" | "offline" | "error";
type DeviceStatus = "online" | "offline" | "busy" | "error";
type TaskStatus = "pending" | "assigned" | "running" | "done" | "failed" | "cancelled" | "timeout" | "completed";
type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

// Row shapes used by the agent
export interface WorkerRow {
  id: string;
  hostname: string;
  status: WorkerStatus | null;
  device_count: number | null;
  xiaowei_connected: boolean | null;
  last_heartbeat: string | null;
  agent_version: string | null;
  os_info: string | null;
}

export interface TaskRow {
  id: string;
  type: string;
  task_type: string | null;
  status: TaskStatus | null;
  priority: number | null;
  payload: Record<string, unknown>;
  target_devices: string[] | null;
  target_tag: string | null;
  target_workers: string[] | null;
  worker_id: string | null;
  preset_id: string | null;
  device_count: number | null;
  error: string | null;
  result: Record<string, unknown> | null;
}

export interface InsertTaskLog {
  task_id: string;
  task_device_id?: string;
  device_serial?: string;
  worker_id: string;
  action: string;
  level: LogLevel;
  message: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  source?: string;
}

export interface InsertTaskDevice {
  task_id: string;
  device_serial: string;
  worker_id: string;
  status?: TaskStatus;
  xiaowei_action?: string;
  xiaowei_code?: number;
  xiaowei_request?: Record<string, unknown>;
  xiaowei_response?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}

export class SupabaseSync {
  private supabase: SupabaseClient;
  workerId: string = "";
  private broadcastChannel: RealtimeChannel | null = null;
  private taskChannel: RealtimeChannel | null = null;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
  }

  getClient(): SupabaseClient {
    return this.supabase;
  }

  async upsertWorker(hostname: string): Promise<string> {
    // Try to find existing
    const { data: existing } = await this.supabase
      .from("workers")
      .select("id")
      .eq("hostname", hostname)
      .single();

    if (existing) {
      this.workerId = existing.id;
      // Update status to online
      await this.supabase
        .from("workers")
        .update({
          status: "online" as WorkerStatus,
          last_heartbeat: new Date().toISOString(),
          agent_version: "2.1.0",
          os_info: `${process.platform} ${process.arch}`,
        })
        .eq("id", this.workerId);
      log.info(`Found worker: ${this.workerId}`);
      return this.workerId;
    }

    // Create new
    const { data: created, error } = await this.supabase
      .from("workers")
      .insert({
        hostname,
        status: "online" as WorkerStatus,
        agent_version: "2.1.0",
        os_info: `${process.platform} ${process.arch}`,
      })
      .select("id")
      .single();

    if (error || !created) {
      throw new Error(`Failed to create worker: ${error?.message}`);
    }

    this.workerId = created.id;
    log.info(`Created worker: ${this.workerId}`);
    return this.workerId;
  }

  async syncDevices(devices: XiaoweiDevice[], errorSerials?: string[]): Promise<void> {
    const now = new Date().toISOString();
    const activeSerials: string[] = [];
    const errorSerialsSet = new Set(errorSerials ?? []);

    for (const d of devices) {
      if (!d.serial) continue;
      activeSerials.push(d.serial);

      const { error } = await this.supabase.from("devices").upsert(
        {
          serial: d.serial,
          worker_id: this.workerId,
          status: "online" as DeviceStatus,
          model: d.model ?? d.name ?? null,
          battery_level: d.battery ?? null,
          ip_intranet: d.intranetIp || null,
          xiaowei_serial: d.onlySerial || null,
          screen_on: d.screenOn ?? null,
          last_seen: now,
        },
        { onConflict: "serial" }
      );

      if (error) {
        log.error(`Device upsert failed: ${d.serial}`, { error: error.message });
      }
    }

    // Mark devices with errors
    if (errorSerialsSet.size > 0) {
      const errorSerialsList = Array.from(errorSerialsSet);
      await this.supabase
        .from("devices")
        .update({ status: "error" as DeviceStatus, last_seen: now })
        .eq("worker_id", this.workerId)
        .in("serial", errorSerialsList);
    }

    // Mark missing devices offline (excluding active and error serials)
    const excludedSerials = [...activeSerials, ...Array.from(errorSerialsSet)];
    if (excludedSerials.length === 0) {
      await this.supabase
        .from("devices")
        .update({ status: "offline" as DeviceStatus, last_seen: now })
        .eq("worker_id", this.workerId);
    } else {
      await this.supabase
        .from("devices")
        .update({ status: "offline" as DeviceStatus, last_seen: now })
        .eq("worker_id", this.workerId)
        .not("serial", "in", `(${excludedSerials.join(",")})`);
    }
  }

  async updateWorkerHeartbeat(deviceCount: number, xiaoweiConnected: boolean): Promise<void> {
    const { error } = await this.supabase
      .from("workers")
      .update({
        status: "online" as WorkerStatus,
        device_count: deviceCount,
        xiaowei_connected: xiaoweiConnected,
        last_heartbeat: new Date().toISOString(),
      })
      .eq("id", this.workerId);

    if (error) {
      log.error("Heartbeat update failed", { error: error.message });
    }
  }

  async fetchPendingTasks(): Promise<TaskRow[]> {
    // Tasks assigned to this worker
    const { data: assigned } = await this.supabase
      .from("tasks")
      .select("*")
      .eq("worker_id", this.workerId)
      .in("status", ["pending", "assigned"])
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });

    // Unassigned tasks matching this worker or no target
    const { data: unassigned } = await this.supabase
      .from("tasks")
      .select("*")
      .is("worker_id", null)
      .eq("status", "pending")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(10);

    // Claim unassigned tasks
    const claimed: TaskRow[] = [];
    for (const task of unassigned ?? []) {
      const { data, error } = await this.supabase
        .from("tasks")
        .update({
          worker_id: this.workerId,
          status: "assigned" as TaskStatus,
          assigned_at: new Date().toISOString(),
        })
        .eq("id", task.id)
        .is("worker_id", null)
        .select()
        .single();

      if (!error && data) {
        claimed.push(data as TaskRow);
        log.info(`Claimed task: ${task.id}`);
      }
    }

    return [...(assigned ?? []), ...claimed] as TaskRow[];
  }

  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: Record<string, unknown>,
    error?: string
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === "running") update.started_at = new Date().toISOString();
    if (status === "done" || status === "completed" || status === "failed") {
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

  async insertTaskDevice(params: InsertTaskDevice): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("task_devices")
      .insert({
        ...params,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      log.error("task_devices insert failed", { error: error.message });
      return null;
    }
    return data?.id ?? null;
  }

  async updateTaskDevice(
    id: string,
    status: TaskStatus,
    result?: Record<string, unknown>,
    error?: string,
    xiaoweiCode?: number,
    xiaoweiResponse?: Record<string, unknown>
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === "done" || status === "failed") {
      update.completed_at = new Date().toISOString();
    }
    if (result !== undefined) update.result = result;
    if (error !== undefined) update.error = error;
    if (xiaoweiCode !== undefined) update.xiaowei_code = xiaoweiCode;
    if (xiaoweiResponse !== undefined) update.xiaowei_response = xiaoweiResponse;

    await this.supabase.from("task_devices").update(update).eq("id", id);
  }

  async insertTaskLog(params: InsertTaskLog): Promise<void> {
    const { error } = await this.supabase.from("task_logs").insert(params);
    if (error) {
      log.error("task_logs insert failed", { error: error.message });
    }
  }

  subscribeToBroadcast(callback: (task: TaskRow) => void): RealtimeChannel {
    log.info("Subscribing to Broadcast room:tasks");

    this.broadcastChannel = this.supabase
      .channel("room:tasks")
      .on("broadcast", { event: "insert" }, ({ payload }) => {
        const task = (payload as Record<string, unknown>)?.record as TaskRow | undefined;
        if (task?.worker_id === this.workerId && task.status === "pending") {
          log.info(`[Broadcast] New task: ${task.id}`);
          callback(task);
        }
      })
      .on("broadcast", { event: "update" }, ({ payload }) => {
        const task = (payload as Record<string, unknown>)?.record as TaskRow | undefined;
        if (task?.worker_id === this.workerId && (task.status === "pending" || task.status === "assigned")) {
          log.info(`[Broadcast] Task updated: ${task.id}`);
          callback(task);
        }
      })
      .subscribe((status) => {
        log.info(`Broadcast room:tasks: ${status}`);
      });

    return this.broadcastChannel;
  }

  async setWorkerOffline(): Promise<void> {
    if (!this.workerId) return;
    await this.supabase
      .from("workers")
      .update({
        status: "offline" as WorkerStatus,
        xiaowei_connected: false,
        device_count: 0,
      })
      .eq("id", this.workerId);
    log.info("Worker set to offline");
  }

  async unsubscribeAll(): Promise<void> {
    if (this.broadcastChannel) {
      await this.supabase.removeChannel(this.broadcastChannel);
      this.broadcastChannel = null;
    }
    if (this.taskChannel) {
      await this.supabase.removeChannel(this.taskChannel);
      this.taskChannel = null;
    }
  }
}
