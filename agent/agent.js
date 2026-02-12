/**
 * DoAi.Me Node PC Agent
 * Supabase Realtime <-> Xiaowei WebSocket bridge
 * Runs 24/7 on Windows Node PCs
 */
const config = require("./config");
const XiaoweiClient = require("./xiaowei-client");
const SupabaseSync = require("./supabase-sync");
const { startHeartbeat } = require("./heartbeat");
const TaskExecutor = require("./task-executor");

let xiaowei = null;
let supabaseSync = null;
let heartbeatHandle = null;
let taskPollHandle = null;
let taskExecutor = null;
let shuttingDown = false;

async function main() {
  console.log(`[Agent] Starting worker: ${config.workerName}`);
  console.log(`[Agent] Xiaowei URL: ${config.xiaoweiWsUrl}`);
  console.log(`[Agent] Heartbeat interval: ${config.heartbeatInterval}ms`);
  console.log(`[Agent] Task poll interval: ${config.taskPollInterval}ms`);

  // 1. Validate required config
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    console.error("[Agent] SUPABASE_URL and SUPABASE_ANON_KEY are required");
    process.exit(1);
  }

  // 2. Initialize Supabase and register worker
  supabaseSync = new SupabaseSync(
    config.supabaseUrl,
    config.supabaseAnonKey,
    config.supabaseServiceRoleKey
  );

  try {
    const workerId = await supabaseSync.getWorkerId(config.workerName);
    console.log(`[Agent] Worker ID: ${workerId}`);
  } catch (err) {
    console.error(`[Agent] Failed to register worker: ${err.message}`);
    process.exit(1);
  }

  // 3. Initialize Xiaowei WebSocket client
  xiaowei = new XiaoweiClient(config.xiaoweiWsUrl);

  xiaowei.on("connected", () => {
    console.log("[Agent] Xiaowei connection established");
  });

  xiaowei.on("disconnected", () => {
    console.log("[Agent] Xiaowei connection lost, will reconnect...");
  });

  xiaowei.on("error", (err) => {
    console.error(`[Agent] Xiaowei error: ${err.message}`);
  });

  xiaowei.connect();

  // 4. Initialize task executor
  taskExecutor = new TaskExecutor(xiaowei, supabaseSync, config);

  // 5. Start heartbeat loop
  heartbeatHandle = startHeartbeat(xiaowei, supabaseSync, config);

  // 6. Subscribe to tasks via Broadcast (primary) + postgres_changes (fallback)
  const taskCallback = (task) => {
    if (task.status === "pending") {
      taskExecutor.execute(task);
    }
  };

  // Primary: Broadcast channel (room:tasks) — lower latency
  supabaseSync.subscribeToBroadcast(supabaseSync.workerId, taskCallback);

  // Fallback: postgres_changes — in case Broadcast is not configured
  supabaseSync.subscribeToTasks(supabaseSync.workerId, taskCallback);

  // 7. Poll for pending tasks as fallback (Realtime may miss events)
  taskPollHandle = setInterval(async () => {
    try {
      const tasks = await supabaseSync.getPendingTasks(supabaseSync.workerId);
      for (const task of tasks) {
        taskExecutor.execute(task);
      }
    } catch (err) {
      console.error(`[Agent] Task poll error: ${err.message}`);
    }
  }, config.taskPollInterval);

  // Run an initial poll immediately
  try {
    const tasks = await supabaseSync.getPendingTasks(supabaseSync.workerId);
    if (tasks.length > 0) {
      console.log(`[Agent] Found ${tasks.length} pending task(s)`);
      for (const task of tasks) {
        taskExecutor.execute(task);
      }
    }
  } catch (err) {
    console.error(`[Agent] Initial task poll error: ${err.message}`);
  }

  console.log("[Agent] Ready and listening for tasks");
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("\n[Agent] Shutting down gracefully...");

  // Stop polling
  if (taskPollHandle) {
    clearInterval(taskPollHandle);
    taskPollHandle = null;
  }

  // Stop heartbeat
  if (heartbeatHandle) {
    clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }

  // Unsubscribe from Realtime
  if (supabaseSync) {
    await supabaseSync.unsubscribe();
  }

  // Update worker status to offline
  if (supabaseSync && supabaseSync.workerId) {
    try {
      await supabaseSync.updateWorkerStatus(
        supabaseSync.workerId,
        "offline",
        0,
        false
      );
      console.log("[Agent] Worker status set to offline");
    } catch (err) {
      console.error(`[Agent] Failed to update offline status: ${err.message}`);
    }
  }

  // Disconnect Xiaowei
  if (xiaowei) {
    xiaowei.disconnect();
  }

  console.log("[Agent] Shutdown complete");
  process.exit(0);
}

// Handle termination signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle uncaught errors (keep agent alive)
process.on("uncaughtException", (err) => {
  console.error(`[Agent] Uncaught exception: ${err.message}`);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[Agent] Unhandled rejection: ${reason}`);
});

// Start
main().catch((err) => {
  console.error(`[Agent] Fatal error: ${err.message}`);
  process.exit(1);
});
