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
const AccountManager = require("./account-manager");
const ScriptVerifier = require("./script-verifier");
const DashboardBroadcaster = require("./dashboard-broadcaster");
const AdbReconnectManager = require("./adb-reconnect");
const QueueDispatcher = require("./queue-dispatcher");
const ScheduleEvaluator = require("./schedule-evaluator");
const StaleTaskCleaner = require("./stale-task-cleaner");
const DeviceWatchdog = require("./device-watchdog");
const VideoDispatcher = require("./video-dispatcher");
const DeviceOrchestrator = require("./device-orchestrator");

let xiaowei = null;
let supabaseSync = null;
let heartbeatHandle = null;
let taskPollHandle = null;
let taskExecutor = null;
let proxyManager = null;
let accountManager = null;
let scriptVerifier = null;
let broadcaster = null;
let reconnectManager = null;
let queueDispatcher = null;
let scheduleEvaluator = null;
let staleTaskCleaner = null;
let deviceWatchdog = null;
let videoDispatcher = null;
let deviceOrchestrator = null;
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
  console.log(`[Agent] Starting PC: ${config.pcNumber}`);
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

  // 2a. Load dynamic settings from DB and subscribe to changes
  try {
    await config.loadFromDB(supabaseSync.supabase);
    config.subscribeToChanges(supabaseSync.supabase);
    console.log("[Agent] ✓ Settings loaded and Realtime subscription active");
  } catch (err) {
    console.warn(`[Agent] ✗ Settings load failed: ${err.message}`);
  }

  // 3. Register PC
  try {
    const pcId = await supabaseSync.getPcId(config.pcNumber);
    console.log(`[Agent] PC ID: ${pcId}`);
  } catch (err) {
    console.error(`[Agent] ✗ PC registration failed: ${err.message}`);
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

  // 5a. Run stale task recovery (cold start)
  staleTaskCleaner = new StaleTaskCleaner(supabaseSync, config);
  try {
    const recovered = await staleTaskCleaner.recoverStaleTasks();
    if (recovered > 0) {
      console.log(`[Agent] ✓ Recovered ${recovered} stale tasks from previous crash`);
    }
    staleTaskCleaner.startPeriodicCheck();
    console.log('[Agent] ✓ Stale task cleaner started');
  } catch (err) {
    console.warn(`[Agent] ✗ Stale task recovery failed: ${err.message}`);
  }

  // 6. Initialize dashboard broadcaster
  broadcaster = new DashboardBroadcaster(supabaseSync.supabase, supabaseSync.pcId);
  try {
    await broadcaster.init();
    console.log("[Agent] ✓ Dashboard broadcaster initialized");
  } catch (err) {
    console.warn(`[Agent] ✗ Broadcaster init failed: ${err.message}`);
    broadcaster = null; // Disable if initialization fails
  }

  // 7. Initialize ADB reconnect manager (needs to exist before heartbeat)
  reconnectManager = new AdbReconnectManager(xiaowei, supabaseSync, broadcaster, config);

  // 8. Start heartbeat loop and wait for first beat
  heartbeatHandle = startHeartbeat(xiaowei, supabaseSync, config, taskExecutor, broadcaster, reconnectManager, () => deviceOrchestrator);

  // Wait briefly for first heartbeat to complete
  await sleep(2000);
  console.log(`[Agent] ✓ PC registered: ${config.pcNumber} (heartbeat OK)`);

  // 9. Proxy setup — load assignments from Supabase and apply to devices
  proxyManager = new ProxyManager(xiaowei, supabaseSync, config, broadcaster);
  if (xiaowei.connected) {
    try {
      const count = await proxyManager.loadAssignments(supabaseSync.pcId);
      if (count > 0) {
        const { applied, total } = await proxyManager.applyAll();
        console.log(`[Agent] ✓ Proxy setup: ${applied}/${total} devices`);
      } else {
        console.log("[Agent] - Proxy setup: no assignments (skipped)");
      }
      // Start periodic proxy check loop
      proxyManager.startCheckLoop(supabaseSync.pcId);
      console.log("[Agent] ✓ Proxy check loop started");
    } catch (err) {
      console.warn(`[Agent] ✗ Proxy setup failed: ${err.message}`);
    }
  } else {
    console.log("[Agent] - Proxy setup: Xiaowei offline (skipped)");
  }

  // 10. Account verification — check YouTube login on each device
  accountManager = new AccountManager(xiaowei, supabaseSync);
  if (xiaowei.connected) {
    try {
      const count = await accountManager.loadAssignments(supabaseSync.pcId);
      if (count > 0) {
        const { verified, total } = await accountManager.verifyAll();
        console.log(`[Agent] ✓ Account check: ${verified}/${total} YouTube 로그인`);
      } else {
        console.log("[Agent] - Account check: no assignments (skipped)");
      }
    } catch (err) {
      console.warn(`[Agent] ✗ Account check failed: ${err.message}`);
    }
  } else {
    console.log("[Agent] - Account check: Xiaowei offline (skipped)");
  }

  // 11. Script verification — check SCRIPTS_DIR and run test
  scriptVerifier = new ScriptVerifier(xiaowei, config);
  if (config.scriptsDir) {
    try {
      // Pick first known device serial for test run (if available)
      const testSerial = xiaowei.connected
        ? [...(proxyManager?.assignments?.keys() || accountManager?.assignments?.keys() || [])][0] || null
        : null;
      const { dirOk, requiredOk, testOk } = await scriptVerifier.verifyAll(testSerial);

      if (dirOk && requiredOk) {
        console.log(`[Agent] ✓ Script check: ${scriptVerifier.availableScripts.length} scripts, required OK`);
      } else if (dirOk) {
        console.warn("[Agent] ⚠ Script check: directory OK but missing required scripts");
      } else {
        console.warn("[Agent] ✗ Script check: SCRIPTS_DIR not accessible");
      }
    } catch (err) {
      console.warn(`[Agent] ✗ Script check failed: ${err.message}`);
    }
  } else {
    console.log("[Agent] - Script check: SCRIPTS_DIR not configured (skipped)");
  }

  // 12. Subscribe to tasks via Broadcast (primary) + postgres_changes (fallback)
  const taskCallback = (task) => {
    if (task.status === "pending") {
      taskExecutor.execute(task);
    }
  };

  // Primary: Broadcast channel (room:tasks) — lower latency
  const broadcastResult = await supabaseSync.subscribeToBroadcast(supabaseSync.pcId, taskCallback);
  if (broadcastResult.status === "SUBSCRIBED") {
    console.log("[Agent] ✓ Broadcast room:tasks 구독 완료");
  } else {
    console.warn(`[Agent] ✗ Broadcast 구독 실패: ${broadcastResult.status}`);
  }

  // Fallback: postgres_changes — in case Broadcast is not configured
  const pgResult = await supabaseSync.subscribeToTasks(supabaseSync.pcId, taskCallback);
  if (pgResult.status === "SUBSCRIBED") {
    console.log("[Agent] ✓ postgres_changes 구독 완료");
  } else {
    console.warn(`[Agent] ✗ postgres_changes 구독 실패: ${pgResult.status}`);
  }

  // 13. Poll for pending tasks as triple-fallback (Realtime may miss events)
  taskPollHandle = setInterval(async () => {
    try {
      const tasks = await supabaseSync.getPendingTasks(supabaseSync.pcId);
      for (const task of tasks) {
        taskExecutor.execute(task);
      }
    } catch (err) {
      console.error(`[Agent] Task poll error: ${err.message}`);
    }
  }, config.taskPollInterval);

  // Run an initial poll immediately
  try {
    const tasks = await supabaseSync.getPendingTasks(supabaseSync.pcId);
    if (tasks.length > 0) {
      console.log(`[Agent] Found ${tasks.length} pending task(s)`);
      for (const task of tasks) {
        taskExecutor.execute(task);
      }
    }
  } catch (err) {
    console.error(`[Agent] Initial task poll error: ${err.message}`);
  }

  // 14. Start ADB reconnect monitoring (manager already initialized above)
  if (xiaowei.connected) {
    reconnectManager.start();
    console.log("[Agent] ✓ ADB reconnect manager started");
  } else {
    console.log("[Agent] - ADB reconnect: Xiaowei offline (will start when connected)");
  }

  // 14a. Start device watchdog
  deviceWatchdog = new DeviceWatchdog(xiaowei, supabaseSync, config, broadcaster);
  deviceWatchdog.start();
  console.log('[Agent] ✓ Device watchdog started');

  // 15. Start queue dispatcher and schedule evaluator
  queueDispatcher = new QueueDispatcher(supabaseSync, config, broadcaster);
  queueDispatcher.start();
  console.log("[Agent] ✓ Queue dispatcher started");

  scheduleEvaluator = new ScheduleEvaluator(supabaseSync, broadcaster);
  scheduleEvaluator.start();
  console.log("[Agent] ✓ Schedule evaluator started");

  videoDispatcher = new VideoDispatcher(supabaseSync, config, broadcaster);
  if (config.isPrimaryPc) {
    videoDispatcher.start();
    console.log("[Agent] ✓ Video dispatcher started (primary PC)");
  } else {
    console.log("[Agent] - Video dispatcher skipped (not primary PC). Set IS_PRIMARY_PC=true to create job_assignments.");
  }

  // 15b. Start device orchestrator
  deviceOrchestrator = new DeviceOrchestrator(xiaowei, supabaseSync.supabase, taskExecutor, {
    pcId: supabaseSync.pcId,
    maxConcurrent: config.maxConcurrentTasks || 10,
  });
  console.log(`[Agent] DeviceOrchestrator pcId=${supabaseSync.pcId} (UUID for claim_next_assignment)`);
  deviceOrchestrator.start();
  console.log("[Agent] ✓ Device orchestrator started");

  // 13a. Poll pending job_assignments only when not using DeviceOrchestrator (orchestrator handles claim_next_assignment)
  if (!deviceOrchestrator) {
    taskExecutor.startJobAssignmentPolling(15000);
    console.log("[Agent] ✓ Job assignment polling started");
  } else {
    console.log("[Agent] - Job assignment polling skipped (DeviceOrchestrator active)");
  }

  // 16. Wire up config-updated listeners for dynamic interval changes
  config.on("config-updated", ({ key, oldValue, newValue }) => {
    // heartbeat_interval → restart heartbeat loop
    if (key === "heartbeat_interval" && heartbeatHandle) {
      clearInterval(heartbeatHandle);
      heartbeatHandle = startHeartbeat(xiaowei, supabaseSync, config, taskExecutor, broadcaster, reconnectManager, () => deviceOrchestrator);
      console.log(`[Agent] Heartbeat restarted with interval ${newValue}ms`);
    }

    // adb_reconnect_interval → restart ADB reconnect loop
    if (key === "adb_reconnect_interval" && reconnectManager) {
      reconnectManager.stop();
      reconnectManager.reconnectInterval = newValue;
      reconnectManager.start();
      console.log(`[Agent] ADB reconnect restarted with interval ${newValue}ms`);
    }

    // proxy_check_interval or proxy_policy → restart proxy check loop
    if ((key === "proxy_check_interval" || key === "proxy_policy") && proxyManager) {
      proxyManager.applyConfigChange(key, newValue);
    }

    // max_concurrent_tasks → update task executor limit
    if (key === "max_concurrent_tasks" && taskExecutor) {
      taskExecutor.maxConcurrent = newValue;
      console.log(`[Agent] TaskExecutor maxConcurrent updated to ${newValue}`);
    }

    // max_retry_count → update task executor (if it uses it)
    if (key === "max_retry_count" && taskExecutor) {
      taskExecutor.maxRetryCount = newValue;
      console.log(`[Agent] TaskExecutor maxRetryCount updated to ${newValue}`);
    }
  });

  console.log("[Agent] Ready and listening for tasks");
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("\n[Agent] Shutting down gracefully...");

  // Stop stale task cleaner
  if (staleTaskCleaner) {
    staleTaskCleaner.stop();
  }

  // Stop device orchestrator
  if (deviceOrchestrator) {
    deviceOrchestrator.stop();
  }

  // Stop device watchdog
  if (deviceWatchdog) {
    deviceWatchdog.stop();
  }

  // Stop polling
  if (taskPollHandle) {
    clearInterval(taskPollHandle);
    taskPollHandle = null;
  }

  if (taskExecutor && taskExecutor.stopJobAssignmentPolling) {
    taskExecutor.stopJobAssignmentPolling();
  }

  // Stop heartbeat
  if (heartbeatHandle) {
    clearInterval(heartbeatHandle);
    heartbeatHandle = null;
  }

  // Stop ADB reconnect manager
  if (reconnectManager) {
    reconnectManager.stop();
  }

  // Stop proxy manager check loop
  if (proxyManager && proxyManager.stopCheckLoop) {
    proxyManager.stopCheckLoop();
  }

  // Stop queue dispatcher
  if (queueDispatcher) {
    queueDispatcher.stop();
  }

  // Stop schedule evaluator
  if (scheduleEvaluator) {
    scheduleEvaluator.stop();
  }

  if (videoDispatcher) {
    videoDispatcher.stop();
  }

  // Unsubscribe config Realtime
  if (supabaseSync) {
    await config.unsubscribe(supabaseSync.supabase);
  }

  // Clean up broadcaster
  if (broadcaster) {
    await broadcaster.cleanup();
  }

  // Unsubscribe from Realtime
  if (supabaseSync) {
    await supabaseSync.unsubscribe();
  }

  // Update PC status to offline
  if (supabaseSync && supabaseSync.pcId) {
    try {
      await supabaseSync.updatePcStatus(supabaseSync.pcId, "offline");
      console.log("[Agent] PC status set to offline");
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
