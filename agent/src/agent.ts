import * as fs from "fs";
import { loadConfig, AgentConfig } from "./config";
import { initLogger, getLogger } from "./logger";
import { XiaoweiClient, XiaoweiDevice } from "./xiaowei-client";
import { SupabaseSync, TaskRow } from "./supabase-sync";
import { Broadcaster } from "./broadcaster";

let config: AgentConfig;
let log: ReturnType<typeof getLogger> = getLogger("Agent");
let xiaowei: XiaoweiClient;
let sync: SupabaseSync;
let broadcaster: Broadcaster;
let heartbeatHandle: ReturnType<typeof setInterval> | null = null;
let taskPollHandle: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
const runningTasks = new Set<string>();

async function init(): Promise<void> {
  config = loadConfig();

  // Ensure logs directory
  if (!fs.existsSync(config.logsDir)) {
    fs.mkdirSync(config.logsDir, { recursive: true });
  }

  initLogger(config.logsDir);
  log = getLogger("Agent");

  log.info(`Starting worker: ${config.workerHostname}`);
  log.info(`Xiaowei URL: ${config.xiaoweiWsUrl}`);
  log.info(`Heartbeat: ${config.heartbeatInterval}ms, Task poll: ${config.taskPollInterval}ms`);

  // Supabase
  sync = new SupabaseSync(config.supabaseUrl, config.supabaseServiceRoleKey);
  await sync.upsertWorker(config.workerHostname);

  // Broadcaster
  broadcaster = new Broadcaster(sync.getClient(), sync.workerId);

  // Xiaowei
  xiaowei = new XiaoweiClient(config.xiaoweiWsUrl);
  xiaowei.on("connected", () => log.info("Xiaowei connected"));
  xiaowei.on("disconnected", () => log.warn("Xiaowei disconnected, reconnecting..."));
  xiaowei.on("error", (err: Error) => log.error("Xiaowei error", { error: err.message }));
  xiaowei.connect();

  // Broadcast task subscription
  sync.subscribeToBroadcast((task) => {
    if (!runningTasks.has(task.id)) {
      executeTask(task);
    }
  });
}

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

    // Supabase sync
    await sync.updateWorkerHeartbeat(devices.length, xiaowei.connected);
    await sync.syncDevices(devices);

    // Broadcast
    await broadcaster.broadcastWorkerHeartbeat(devices.length, xiaowei.connected);
    await broadcaster.broadcastWorkerDevices(devices);

    log.info(`Heartbeat OK — ${devices.length} device(s), xiaowei=${xiaowei.connected}`);
  } catch (err) {
    log.error("Heartbeat error", { error: (err as Error).message });
  }
}

function startHeartbeat(): void {
  heartbeat(); // Run immediately
  heartbeatHandle = setInterval(heartbeat, config.heartbeatInterval);
}

async function pollTasks(): Promise<void> {
  try {
    const tasks = await sync.fetchPendingTasks();
    for (const task of tasks) {
      if (!runningTasks.has(task.id)) {
        executeTask(task);
      }
    }
  } catch (err) {
    log.error("Task poll error", { error: (err as Error).message });
  }
}

function startTaskPolling(): void {
  pollTasks(); // Run immediately
  taskPollHandle = setInterval(pollTasks, config.taskPollInterval);
}

async function executeTask(task: TaskRow): Promise<void> {
  if (runningTasks.size >= config.maxConcurrentTasks) {
    log.warn(`Max concurrent tasks (${config.maxConcurrentTasks}), skipping ${task.id}`);
    return;
  }
  if (runningTasks.has(task.id)) return;
  runningTasks.add(task.id);

  const taskType = task.task_type || task.type;
  log.info(`Executing task ${task.id} (${taskType})`);

  try {
    await sync.updateTaskStatus(task.id, "running");

    if (!xiaowei.connected) {
      throw new Error("Xiaowei is not connected");
    }

    const devices = resolveDevices(task);
    const result = await dispatchTask(taskType, task, devices);

    await sync.insertTaskLog({
      task_id: task.id,
      worker_id: sync.workerId,
      action: taskType,
      level: "info",
      message: "Task completed",
      request: task.payload as Record<string, unknown>,
      response: result as Record<string, unknown>,
      source: "agent",
    });

    await sync.updateTaskStatus(task.id, "done", result as Record<string, unknown>);
    log.info(`Task ${task.id} completed`);
  } catch (err) {
    const message = (err as Error).message;
    log.error(`Task ${task.id} failed: ${message}`);

    await sync.insertTaskLog({
      task_id: task.id,
      worker_id: sync.workerId,
      action: taskType,
      level: "error",
      message,
      source: "agent",
    });

    await sync.updateTaskStatus(task.id, "failed", undefined, message);
  } finally {
    runningTasks.delete(task.id);
  }
}

function resolveDevices(task: TaskRow): string {
  if (task.target_devices && task.target_devices.length > 0) {
    return task.target_devices.join(",");
  }
  return "all";
}

async function dispatchTask(
  taskType: string,
  task: TaskRow,
  devices: string
): Promise<unknown> {
  const payload = (task.payload ?? {}) as Record<string, unknown>;
  const options = {
    count: (payload.count as number) ?? 1,
    taskInterval: (payload.taskInterval as [number, number]) ?? [1000, 3000],
    deviceInterval: (payload.deviceInterval as string) ?? "500",
  };

  switch (taskType) {
    case "action":
    case "preset": {
      const actionName = (payload.actionName as string) ?? "";
      if (!actionName) throw new Error("actionName required");
      return xiaowei.actionCreate(devices, actionName, options);
    }
    case "script": {
      const scriptPath = (payload.scriptPath as string) ?? "";
      if (!scriptPath) throw new Error("scriptPath required");
      return xiaowei.autojsCreate(devices, scriptPath, options);
    }
    case "adb": {
      const command = (payload.command as string) ?? "";
      if (!command) throw new Error("command required");
      return xiaowei.adbShell(devices, command);
    }
    case "youtube":
    case "direct":
    case "batch":
      // Route to action or script based on payload
      if (payload.actionName) {
        return xiaowei.actionCreate(devices, payload.actionName as string, options);
      }
      if (payload.scriptPath) {
        return xiaowei.autojsCreate(devices, payload.scriptPath as string, options);
      }
      throw new Error(`${taskType}: actionName or scriptPath required`);
    default:
      throw new Error(`Unknown task type: ${taskType}`);
  }
}

async function gracefulShutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("Shutting down gracefully...");

  if (taskPollHandle) { clearInterval(taskPollHandle); taskPollHandle = null; }
  if (heartbeatHandle) { clearInterval(heartbeatHandle); heartbeatHandle = null; }

  await sync.unsubscribeAll();
  await broadcaster.cleanup();
  await sync.setWorkerOffline();
  xiaowei.disconnect();

  log.info("Shutdown complete");
  process.exit(0);
}

// Signal handlers
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
process.on("uncaughtException", (err) => {
  const l = log ?? console;
  l.error(`Uncaught exception: ${err.message}`, { stack: err.stack });
});
process.on("unhandledRejection", (reason) => {
  const l = log ?? console;
  l.error(`Unhandled rejection: ${reason}`);
});

// Start
(async () => {
  try {
    await init();
    startHeartbeat();
    startTaskPolling();
    log.info("Agent ready and listening for tasks");
  } catch (err) {
    console.error(`Fatal: ${(err as Error).message}`);
    process.exit(1);
  }
})();
