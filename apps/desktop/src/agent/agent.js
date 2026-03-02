/**
 * DoAi.Me Node PC Agent
 * Supabase Realtime <-> Xiaowei WebSocket bridge
 * Runs 24/7 on Windows Node PCs
 */
const os = require("os");
const config = require("./config");
const XiaoweiClient = require("./core/xiaowei-client");
const SupabaseSync = require("./core/supabase-sync");
const DashboardBroadcaster = require("./core/dashboard-broadcaster");
const { startHeartbeat } = require("./device/heartbeat");
const AdbReconnectManager = require("./device/adb-reconnect");
const DeviceWatchdog = require("./device/device-watchdog");
const DeviceOrchestrator = require("./device/device-orchestrator");
const TaskExecutor = require("./task/task-executor");
const StaleTaskCleaner = require("./task/stale-task-cleaner");
const QueueDispatcher = require("./scheduling/queue-dispatcher");
const ScheduleEvaluator = require("./scheduling/schedule-evaluator");
const ProxyManager = require("./setup/proxy-manager");
const AccountManager = require("./setup/account-manager");
const ScriptVerifier = require("./setup/script-verifier");
const presets = require("./device/device-presets");
const sleep = require("./lib/sleep");
const logger = require("./lib/logger");

let xiaowei = null;
let supabaseSync = null;
let heartbeatHandle = null;
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
let deviceOrchestrator = null;
let shuttingDown = false;

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
  console.log(`[Agent] Starting (hostname: ${os.hostname()})`);
  console.log(`[Agent] Xiaowei URL: ${config.xiaoweiWsUrl}`);

  // ---------- Phase 1: Environment / DB / settings ----------
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

  // 3. Register PC — hostname-based DB assignment (no PC_NUMBER env required)
  try {
    const hostname = os.hostname();
    const pcNumber = await supabaseSync.getPcByHostname(hostname);
    config.pcNumber = pcNumber;
    console.log(`[Agent] ✓ PC registered: ${pcNumber} (hostname: ${hostname})`);
    config.setPrimaryFromDb(supabaseSync.pcUuid);
  } catch (err) {
    console.error(`[Agent] ✗ PC registration failed: ${err.message}`);
    process.exit(1);
  }

  logger.info("Agent", `Phase 1 complete: env/DB/settings`, { pc_id: supabaseSync.pcId });

  // ---------- Phase 2: Xiaowei / device preparation ----------
  // 4. Initialize Xiaowei WebSocket client (Rule D: do not exit process on connection failure)
  xiaowei = new XiaoweiClient(config.xiaoweiWsUrl);

  xiaowei.on("disconnected", () => {
    console.log("[Agent] Xiaowei connection lost, will reconnect...");
  });

  xiaowei.on("error", (err) => {
    if (!err.message.includes("ECONNREFUSED")) {
      console.error(`[Agent] Xiaowei error: ${err.message}`);
    }
  });

  /** Rule D: On connected/reconnected, run init routine (orchestrator state, device list, proxy re-apply, subscription check). */
  async function onXiaoweiConnected() {
    try {
      const listRes = await xiaowei.list();
      const devices = listRes?.data || listRes || [];
      const serials = Array.isArray(devices) ? devices.map((d) => d.onlySerial || d.serial || d.serialNumber || d.id).filter(Boolean) : [];
      if (proxyManager && serials.length > 0) {
        await proxyManager.loadAssignments(supabaseSync.pcUuid);
        await proxyManager.applyAll();
      }
      logger.info("Agent", "Xiaowei connected/reconnected — init routine done (device list, proxy re-apply)", { pc_id: supabaseSync.pcId });
    } catch (err) {
      logger.warn("Agent", `Xiaowei init routine failed: ${err.message}`, { pc_id: supabaseSync.pcId });
    }
  }

  xiaowei.on("connected", onXiaoweiConnected);

  try {
    await waitForXiaowei(xiaowei, 10000);
    console.log(`[Agent] ✓ Xiaowei connected (${config.xiaoweiWsUrl})`);
  } catch (err) {
    console.warn(`[Agent] ✗ Xiaowei connection failed: ${err.message}`);
    console.warn("[Agent] Agent will continue — Xiaowei will auto-reconnect");
  }

  // 4a. Run optimize on all devices once on first connect (effects off, resolution 1080x1920)
  if (xiaowei.connected && config.runOptimizeOnConnect) {
    try {
      const listRes = await xiaowei.list();
      const devices = listRes.data || listRes || [];
      const serials = devices.map((d) => d.onlySerial || d.serial || d.serialNumber || d.id).filter(Boolean);
      if (serials.length > 0) {
        console.log(`[Agent] Running optimize on ${serials.length} device(s) (first connect)...`);
        for (const serial of serials) {
          await presets.optimize(xiaowei, serial);
        }
        console.log("[Agent] ✓ Optimize on connect done");
      }
    } catch (err) {
      console.warn(`[Agent] ✗ Optimize on connect failed: ${err.message}`);
    }
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
      const count = await proxyManager.loadAssignments(supabaseSync.pcUuid);
      if (count > 0) {
        const { applied, total } = await proxyManager.applyAll();
        console.log(`[Agent] ✓ Proxy setup: ${applied}/${total} devices`);
      } else {
        console.log("[Agent] - Proxy setup: no assignments (skipped)");
      }
      // Start periodic proxy check loop
      proxyManager.startCheckLoop(supabaseSync.pcUuid);
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
      const count = await accountManager.loadAssignments(supabaseSync.pcUuid);
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

  logger.info("Agent", "Phase 2 complete: Xiaowei/devices/proxy/accounts/scripts", { pc_id: supabaseSync.pcId });

  // ---------- Phase 3: Orchestrator / dispatcher / heartbeat ----------
  // 12. Task execution: SSOT is task_devices only — claim_task_devices_for_pc / claim_next_task_device → runTaskDevice (Rule 1). No job_assignments path.
  // 13. Start ADB reconnect monitoring (manager already initialized above)
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

  // 15. Queue dispatcher: primary PC only (Rule F)
  queueDispatcher = new QueueDispatcher(supabaseSync, config, broadcaster);
  if (config.isPrimaryPc) {
    queueDispatcher.start();
    console.log("[Agent] ✓ Queue dispatcher started (primary PC)");
    logger.info("Agent", "QueueDispatcher running on primary PC", { pc_id: supabaseSync.pcId });
  } else {
    console.log("[Agent] QueueDispatcher not started (non-primary PC)");
  }

  scheduleEvaluator = new ScheduleEvaluator(supabaseSync, broadcaster);
  scheduleEvaluator.start();
  console.log("[Agent] ✓ Schedule evaluator started");

  // 15b. Start device orchestrator
  deviceOrchestrator = new DeviceOrchestrator(xiaowei, supabaseSync.supabase, taskExecutor, {
    pcId: supabaseSync.pcId,
    pcUuid: supabaseSync.pcUuid,
    maxConcurrent: config.maxConcurrentTasks || 10,
    loggingDir: config.loggingDir,
  });
  console.log(`[Agent] DeviceOrchestrator pcId=${supabaseSync.pcId}`);
  deviceOrchestrator.start();
  console.log("[Agent] ✓ Device orchestrator started");

  logger.info("Agent", "Phase 3 complete: orchestrator/dispatcher/heartbeat running", { pc_id: supabaseSync.pcId });

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
