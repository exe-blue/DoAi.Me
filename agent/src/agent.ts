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
          const count = Math.min((errorCountMap.get(serial) || 0) + 1, ERROR_THRESHOLD);
          errorCountMap.set(serial, count);
          if (count < ERROR_THRESHOLD) errorSerials.push(serial);
        }
      }
    }

    // Clear error counts for returned devices
    for (const serial of currentSerials) {
      errorCountMap.delete(serial);
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
