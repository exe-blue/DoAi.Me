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
const ProxyManager = require("./proxy-manager");

let xiaowei = null;
let supabaseSync = null;
let heartbeatHandle = null;
let taskPollHandle = null;
let taskExecutor = null;
let proxyManager = null;
let shuttingDown = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for Xiaowei WebSocket to connect with timeout
 * @param {XiaoweiClient} client
 * @param {number} timeoutMs - Max time to wait for connection
 * @returns {Promise<void>}
 */
function waitForXiaowei(client, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (client.connected) {
      return resolve();
    }

    const timeout = setTimeout(() => {
      client.removeListener("connected", onConnect);
      reject(new Error(`Xiaowei did not connect within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    function onConnect() {
      clearTimeout(timeout);
      resolve();
    }

    client.once("connected", onConnect);
    client.connect();
  });
}

async function main() {
  console.log(`[Agent] Starting worker: ${config.workerName}`);
  console.log(`[Agent] Xiaowei URL: ${config.xiaoweiWsUrl}`);

  // 1. Validate required config
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    console.error("[Agent] ✗ SUPABASE_URL and SUPABASE_ANON_KEY are required");
    process.exit(1);
  }

  // 2. Initialize and verify Supabase connection
  supabaseSync = new SupabaseSync(
    config.supabaseUrl,
    config.supabaseAnonKey,
    config.supabaseServiceRoleKey
  );

  try {
    await supabaseSync.verifyConnection();
    console.log("[Agent] ✓ Supabase connected");
  } catch (err) {
    console.error(`[Agent] ✗ Supabase connection failed: ${err.message}`);
    process.exit(1);
  }

  // 3. Register worker
  try {
    const workerId = await supabaseSync.getWorkerId(config.workerName);
    console.log(`[Agent] Worker ID: ${workerId}`);
  } catch (err) {
    console.error(`[Agent] ✗ Worker registration failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Initialize Xiaowei WebSocket client and wait for connection
  xiaowei = new XiaoweiClient(config.xiaoweiWsUrl);

  xiaowei.on("disconnected", () => {
    console.log("[Agent] Xiaowei connection lost, will reconnect...");
  });

  xiaowei.on("error", (err) => {
    // Only log non-ECONNREFUSED errors (reconnect handles refused)
    if (!err.message.includes("ECONNREFUSED")) {
      console.error(`[Agent] Xiaowei error: ${err.message}`);
    }
  });

  // Wait for Xiaowei connection with timeout
  try {
    await waitForXiaowei(xiaowei, 10000);
    console.log(`[Agent] ✓ Xiaowei connected (${config.xiaoweiWsUrl})`);
  } catch (err) {
    console.warn(`[Agent] ✗ Xiaowei connection failed: ${err.message}`);
    console.warn("[Agent] Agent will continue — Xiaowei will auto-reconnect");
  }

  // 5. Initialize task executor
  taskExecutor = new TaskExecutor(xiaowei, supabaseSync, config);

  // 6. Start heartbeat loop and wait for first beat
  heartbeatHandle = startHeartbeat(xiaowei, supabaseSync, config);

  // Wait briefly for first heartbeat to complete
  await sleep(2000);
  console.log(`[Agent] ✓ Worker registered: ${config.workerName} (heartbeat OK)`);

  // 7. Proxy setup — load assignments from Supabase and apply to devices
  proxyManager = new ProxyManager(xiaowei, supabaseSync);
  if (xiaowei.connected) {
    try {
      const count = await proxyManager.loadAssignments(supabaseSync.workerId);
      if (count > 0) {
        const { applied, total } = await proxyManager.applyAll();
        console.log(`[Agent] ✓ Proxy setup: ${applied}/${total} devices`);
      } else {
        console.log("[Agent] - Proxy setup: no assignments (skipped)");
      }
    } catch (err) {
      console.warn(`[Agent] ✗ Proxy setup failed: ${err.message}`);
    }
  } else {
    console.log("[Agent] - Proxy setup: Xiaowei offline (skipped)");
  }

  // 8. Subscribe to tasks via Broadcast (primary) + postgres_changes (fallback)
  const taskCallback = (task) => {
    if (task.status === "pending") {
      taskExecutor.execute(task);
    }
  };

  // Primary: Broadcast channel (room:tasks) — lower latency
  supabaseSync.subscribeToBroadcast(supabaseSync.workerId, taskCallback);

  // Fallback: postgres_changes — in case Broadcast is not configured
  supabaseSync.subscribeToTasks(supabaseSync.workerId, taskCallback);

  // 8. Poll for pending tasks as fallback (Realtime may miss events)
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
