/**
 * DoAi.Me Node PC Agent
 * Supabase Realtime <-> Xiaowei WebSocket bridge
 * Runs 24/7 on Windows Node PCs
 */
const config = require("./common/config");
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
const { getLogger, cleanOldLogs } = require("./common/logger");

const log = getLogger("agent");
cleanOldLogs(7);
let xiaowei = null;
let supabaseSync = null;
let heartbeatHandle = null;
let taskPollHandle = null;
let taskQueuePollHandle = null;
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
let taskDevicesRunner = null;
let shuttingDown = false;
let healthServer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Startup self-test: verify Supabase, Xiaowei, PC registration, and first heartbeat.
 * Call after first heartbeat has had time to run (e.g. 2s after startHeartbeat).
 * @throws {Error} with specific reason on failure
 */
async function selfTest(supabaseSync, xiaowei, config) {
  // 1. Verify Supabase connectivity (read settings table)
  const { data: settingsRow, error: settingsError } =
    await supabaseSync.supabase
      .from("settings")
      .select("key")
      .limit(1)
      .maybeSingle();
  if (settingsError) {
    throw new Error(
      `Supabase: settings table unreachable (${settingsError.message})`,
    );
  }

  // 2. Verify Xiaowei connectivity (call list())
  if (!xiaowei.connected) {
    throw new Error("Xiaowei: not connected");
  }
  let deviceList = [];
  try {
    const res = await xiaowei.list();
    if (Array.isArray(res)) {
      deviceList = res;
    } else if (
      res &&
      typeof res === "object" &&
      (res.data || res.devices || res.list)
    ) {
      deviceList = res.data || res.devices || res.list || [];
    }
  } catch (err) {
    throw new Error(`Xiaowei: list() failed (${err.message})`);
  }

  // 3. PC registration (pcId must be set)
  if (!supabaseSync.pcId) {
    throw new Error("PC registration missing (pcId not set)");
  }

  // 4. Verify first heartbeat was recorded (last_heartbeat within last 2 min)
  const { data: pcRow, error: pcError } = await supabaseSync.supabase
    .from("pcs")
    .select("id, last_heartbeat, status")
    .eq("id", supabaseSync.pcId)
    .maybeSingle();
  if (pcError || !pcRow) {
    throw new Error(
      `Supabase: pcs row not found (${pcError?.message || "no row"})`,
    );
  }
  const lastHb = pcRow.last_heartbeat
    ? new Date(pcRow.last_heartbeat).getTime()
    : 0;
  const twoMinAgo = Date.now() - 2 * 60 * 1000;
  if (lastHb < twoMinAgo) {
    throw new Error(
      "First heartbeat not yet recorded (last_heartbeat too old)",
    );
  }

  log.info(
    `[Agent] Self-test passed: Supabase OK, Xiaowei OK (${deviceList.length} device(s)), PC ${config.pcNumber} registered, heartbeat OK`,
  );
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
  log.info(`[Agent] Starting PC: ${config.pcNumber}`);
  log.info(`[Agent] Xiaowei URL: ${config.xiaoweiWsUrl}`);

  // 1. Validate required config
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    log.error("[Agent] ✗ SUPABASE_URL and SUPABASE_ANON_KEY are required");
    process.exit(1);
  }

  // 2. Initialize and verify Supabase connection
  supabaseSync = new SupabaseSync(
    config.supabaseUrl,
    config.supabaseAnonKey,
    config.supabaseServiceRoleKey,
  );

  try {
    await supabaseSync.verifyConnection();
    log.info("[Agent] ✓ Supabase connected");
  } catch (err) {
    log.error(`[Agent] ✗ Supabase connection failed: ${err.message}`);
    process.exit(1);
  }

  // 2a. Load dynamic settings from DB and subscribe to changes
  try {
    await config.loadFromDB(supabaseSync.supabase);
    config.subscribeToChanges(supabaseSync.supabase);
    log.info("[Agent] ✓ Settings loaded and Realtime subscription active");
  } catch (err) {
    log.warn(`[Agent] ✗ Settings load failed: ${err.message}`);
  }

  // 3. Register PC
  try {
    const pcId = await supabaseSync.getPcId(config.pcNumber);
    log.info(`[Agent] PC ID: ${pcId}`);
  } catch (err) {
    log.error(`[Agent] ✗ PC registration failed: ${err.message}`);
    process.exit(1);
  }

  // 4. Initialize Xiaowei WebSocket client and wait for connection
  xiaowei = new XiaoweiClient(config.xiaoweiWsUrl);

  xiaowei.on("disconnected", () => {
    log.info("[Agent] Xiaowei connection lost, will reconnect...");
  });

  xiaowei.on("error", (err) => {
    // Only log non-ECONNREFUSED errors (reconnect handles refused)
    if (!err.message.includes("ECONNREFUSED")) {
      log.error(`[Agent] Xiaowei error: ${err.message}`);
    }
  });

  // Wait for Xiaowei connection with timeout
  try {
    await waitForXiaowei(xiaowei, 10000);
    log.info(`[Agent] ✓ Xiaowei connected (${config.xiaoweiWsUrl})`);
  } catch (err) {
    log.warn(`[Agent] ✗ Xiaowei connection failed: ${err.message}`);
    log.warn("[Agent] Agent will continue — Xiaowei will auto-reconnect");
  }

  // 5. Initialize task executor
  taskExecutor = new TaskExecutor(xiaowei, supabaseSync, config);

  // 5a. Run stale task recovery (cold start)
  staleTaskCleaner = new StaleTaskCleaner(supabaseSync, config);
  try {
    const recovered = await staleTaskCleaner.recoverStaleTasks();
    if (recovered > 0) {
      log.info(
        `[Agent] ✓ Recovered ${recovered} stale tasks from previous crash`,
      );
    }
    staleTaskCleaner.startPeriodicCheck();
    log.info("[Agent] ✓ Stale task cleaner started");
  } catch (err) {
    log.warn(`[Agent] ✗ Stale task recovery failed: ${err.message}`);
  }

  // 6. Initialize dashboard broadcaster
  broadcaster = new DashboardBroadcaster(
    supabaseSync.supabase,
    supabaseSync.pcId,
  );
  try {
    await broadcaster.init();
    log.info("[Agent] ✓ Dashboard broadcaster initialized");
  } catch (err) {
    log.warn(`[Agent] ✗ Broadcaster init failed: ${err.message}`);
    broadcaster = null; // Disable if initialization fails
  }

  // 7. Initialize ADB reconnect manager (needs to exist before heartbeat)
  reconnectManager = new AdbReconnectManager(
    xiaowei,
    supabaseSync,
    broadcaster,
    config,
  );

  // 8. Start heartbeat loop and wait for first beat
  heartbeatHandle = startHeartbeat(
    xiaowei,
    supabaseSync,
    config,
    taskExecutor,
    broadcaster,
    reconnectManager,
    () => deviceOrchestrator,
  );

  // Wait briefly for first heartbeat to complete, then run self-test
  await sleep(2000);
  try {
    await selfTest(supabaseSync, xiaowei, config);
  } catch (err) {
    log.error(`[Agent] ✗ Self-test failed: ${err.message}`);
    process.exit(1);
  }
  log.info(`[Agent] ✓ PC registered: ${config.pcNumber} (heartbeat OK)`);

  // 9. Proxy setup — load assignments from Supabase and apply to devices
  proxyManager = new ProxyManager(xiaowei, supabaseSync, config, broadcaster);
  if (xiaowei.connected) {
    try {
      const count = await proxyManager.loadAssignments(supabaseSync.pcId);
      if (count > 0) {
        const { applied, total } = await proxyManager.applyAll();
        log.info(`[Agent] ✓ Proxy setup: ${applied}/${total} devices`);
      } else {
        log.info("[Agent] - Proxy setup: no assignments (skipped)");
      }
      // Start periodic proxy check loop
      proxyManager.startCheckLoop(supabaseSync.pcId);
      log.info("[Agent] ✓ Proxy check loop started");
    } catch (err) {
      log.warn(`[Agent] ✗ Proxy setup failed: ${err.message}`);
    }
  } else {
    log.info("[Agent] - Proxy setup: Xiaowei offline (skipped)");
  }

  // 10. Account verification — check YouTube login on each device
  accountManager = new AccountManager(xiaowei, supabaseSync);
  if (xiaowei.connected) {
    try {
      const count = await accountManager.loadAssignments(supabaseSync.pcId);
      if (count > 0) {
        const { verified, total } = await accountManager.verifyAll();
        log.info(
          `[Agent] ✓ Account check: ${verified}/${total} YouTube 로그인`,
        );
      } else {
        log.info("[Agent] - Account check: no assignments (skipped)");
      }
    } catch (err) {
      log.warn(`[Agent] ✗ Account check failed: ${err.message}`);
    }
  } else {
    log.info("[Agent] - Account check: Xiaowei offline (skipped)");
  }

  // 11. Script verification — check SCRIPTS_DIR and run test
  scriptVerifier = new ScriptVerifier(xiaowei, config);
  if (config.scriptsDir) {
    try {
      // Pick first known device serial for test run (if available)
      const testSerial = xiaowei.connected
        ? [
            ...(proxyManager?.assignments?.keys() ||
              accountManager?.assignments?.keys() ||
              []),
          ][0] || null
        : null;
      const { dirOk, requiredOk, testOk } =
        await scriptVerifier.verifyAll(testSerial);

      if (dirOk && requiredOk) {
        log.info(
          `[Agent] ✓ Script check: ${scriptVerifier.availableScripts.length} scripts, required OK`,
        );
      } else if (dirOk) {
        log.warn(
          "[Agent] ⚠ Script check: directory OK but missing required scripts",
        );
      } else {
        log.warn("[Agent] ✗ Script check: SCRIPTS_DIR not accessible");
      }
    } catch (err) {
      log.warn(`[Agent] ✗ Script check failed: ${err.message}`);
    }
  } else {
    log.info("[Agent] - Script check: SCRIPTS_DIR not configured (skipped)");
  }

  // 12. Legacy tasks path: Broadcast + postgres_changes + task_queue + poll (only when NOT using task_devices engine)
  if (!config.useTaskDevicesEngine) {
    const taskCallback = (task) => {
      if (task.status === "pending") {
        taskExecutor.execute(task);
      }
    };

    const broadcastResult = await supabaseSync.subscribeToBroadcast(
      supabaseSync.pcId,
      taskCallback,
    );
    if (broadcastResult.status === "SUBSCRIBED") {
      log.info("[Agent] ✓ Broadcast room:tasks 구독 완료");
    } else {
      log.warn(`[Agent] ✗ Broadcast 구독 실패: ${broadcastResult.status}`);
    }

    const pgResult = await supabaseSync.subscribeToTasks(
      supabaseSync.pcId,
      taskCallback,
    );
    if (pgResult.status === "SUBSCRIBED") {
      log.info("[Agent] ✓ postgres_changes 구독 완료");
    } else {
      log.warn(`[Agent] ✗ postgres_changes 구독 실패: ${pgResult.status}`);
    }

    const workerChannelResult =
      await supabaseSync.subscribeToTaskQueueAndCommands(config.pcNumber, {
        onTaskQueue: async (queueRow) => {
          if (queueRow.status !== "queued") return;
          const task = await supabaseSync.createTaskFromQueueItem(
            queueRow,
            supabaseSync.pcId,
          );
          if (task) taskExecutor.execute(task);
        },
        onCommand: async (cmdRow) => {
          if (cmdRow.status !== "pending") return;
          try {
            await supabaseSync.supabase
              .from("commands")
              .update({ status: "running" })
              .eq("id", cmdRow.id);
            await supabaseSync.supabase
              .from("commands")
              .update({
                status: "completed",
                completed_at: new Date().toISOString(),
              })
              .eq("id", cmdRow.id);
            log.info(`[Agent] Command ${cmdRow.id} completed`);
          } catch (err) {
            log.error(`[Agent] Command ${cmdRow.id} failed: ${err.message}`);
            await supabaseSync.supabase
              .from("commands")
              .update({
                status: "failed",
                completed_at: new Date().toISOString(),
                result: { error: err.message },
              })
              .eq("id", cmdRow.id);
          }
        },
      });
    if (workerChannelResult.status === "SUBSCRIBED") {
      log.info("[Agent] ✓ task_queue + commands 구독 완료");
    } else {
      log.warn(
        `[Agent] ✗ task_queue+commands 구독 실패: ${workerChannelResult.status}`,
      );
    }

    const processTaskQueuePending = async () => {
      try {
        const items = await supabaseSync.getPendingTaskQueueItems(
          config.pcNumber,
        );
        for (const row of items) {
          const task = await supabaseSync.createTaskFromQueueItem(
            row,
            supabaseSync.pcId,
          );
          if (task) taskExecutor.execute(task);
        }
      } catch (err) {
        log.error(`[Agent] Task queue poll error: ${err.message}`);
      }
    };
    taskQueuePollHandle = setInterval(processTaskQueuePending, 60000);
    processTaskQueuePending();

    taskPollHandle = setInterval(async () => {
      try {
        const tasks = await supabaseSync.getPendingTasks(supabaseSync.pcId);
        for (const task of tasks) {
          taskExecutor.execute(task);
        }
      } catch (err) {
        log.error(`[Agent] Task poll error: ${err.message}`);
      }
    }, config.taskPollInterval);

    try {
      const tasks = await supabaseSync.getPendingTasks(supabaseSync.pcId);
      if (tasks.length > 0) {
        log.info(`[Agent] Found ${tasks.length} pending task(s)`);
        for (const task of tasks) {
          taskExecutor.execute(task);
        }
      }
    } catch (err) {
      log.error(`[Agent] Initial task poll error: ${err.message}`);
    }
  } else {
    // Task-devices path: task_queue → create task + fan-out (no execute); commands → absorb into task + task_devices
    const workerChannelResult =
      await supabaseSync.subscribeToTaskQueueAndCommands(config.pcNumber, {
        onTaskQueue: async (queueRow) => {
          if (queueRow.status !== "queued") return;
          const task = await supabaseSync.createTaskFromQueueItem(
            queueRow,
            supabaseSync.pcId,
          );
          if (task) {
            const n = await supabaseSync.fanOutTaskDevicesForTask(
              task.id,
              supabaseSync.pcId,
              { taskConfig: queueRow.task_config },
            );
            log.info(
              `[Agent] task_queue → task ${task.id} + ${n} task_devices (runner will claim)`,
            );
          }
        },
        onCommand: async (cmdRow) => {
          if (cmdRow.status !== "pending") return;
          try {
            await supabaseSync.supabase
              .from("commands")
              .update({ status: "running" })
              .eq("id", cmdRow.id);
            const task = await supabaseSync.createTaskAndTaskDevicesFromCommand(
              cmdRow,
              supabaseSync.pcId,
            );
            if (task) {
              await supabaseSync.supabase
                .from("commands")
                .update({
                  status: "completed",
                  completed_at: new Date().toISOString(),
                  result: { task_id: task.id },
                })
                .eq("id", cmdRow.id);
              log.info(
                `[Agent] Command ${cmdRow.id} absorbed → task ${task.id} + task_devices`,
              );
            } else {
              await supabaseSync.supabase
                .from("commands")
                .update({
                  status: "failed",
                  completed_at: new Date().toISOString(),
                  result: { error: "createTaskAndTaskDevicesFromCommand failed" },
                })
                .eq("id", cmdRow.id);
            }
          } catch (err) {
            log.error(`[Agent] Command ${cmdRow.id} absorb failed: ${err.message}`);
            await supabaseSync.supabase
              .from("commands")
              .update({
                status: "failed",
                completed_at: new Date().toISOString(),
                result: { error: err.message },
              })
              .eq("id", cmdRow.id);
          }
        },
      });
    if (workerChannelResult.status === "SUBSCRIBED") {
      log.info("[Agent] ✓ task_queue + commands 구독 (task_devices fan-out/absorb)");
    } else {
      log.warn(
        `[Agent] ✗ task_queue+commands 구독 실패: ${workerChannelResult.status}`,
      );
    }

    const processTaskQueuePending = async () => {
      try {
        const items = await supabaseSync.getPendingTaskQueueItems(
          config.pcNumber,
        );
        for (const row of items) {
          const task = await supabaseSync.createTaskFromQueueItem(
            row,
            supabaseSync.pcId,
          );
          if (task) {
            await supabaseSync.fanOutTaskDevicesForTask(task.id, supabaseSync.pcId, {
              taskConfig: row.task_config,
            });
          }
        }
      } catch (err) {
        log.error(`[Agent] Task queue poll error: ${err.message}`);
      }
    };
    taskQueuePollHandle = setInterval(processTaskQueuePending, 60000);
    processTaskQueuePending();
  }

  // 14. Start ADB reconnect monitoring (manager already initialized above)
  if (xiaowei.connected) {
    reconnectManager.start();
    log.info("[Agent] ✓ ADB reconnect manager started");
  } else {
    log.info(
      "[Agent] - ADB reconnect: Xiaowei offline (will start when connected)",
    );
  }

  // 14a. Start device watchdog
  deviceWatchdog = new DeviceWatchdog(
    xiaowei,
    supabaseSync,
    config,
    broadcaster,
  );
  deviceWatchdog.start();
  log.info("[Agent] ✓ Device watchdog started");

  // 15. Start queue dispatcher and schedule evaluator
  queueDispatcher = new QueueDispatcher(supabaseSync, config, broadcaster);
  queueDispatcher.start();
  log.info("[Agent] ✓ Queue dispatcher started");

  scheduleEvaluator = new ScheduleEvaluator(supabaseSync, broadcaster);
  scheduleEvaluator.start();
  log.info("[Agent] ✓ Schedule evaluator started");

  // 15b. Start device orchestrator (before VideoDispatcher so nudge target exists)
  deviceOrchestrator = new DeviceOrchestrator(
    xiaowei,
    supabaseSync.supabase,
    taskExecutor,
    {
      pcId: supabaseSync.pcId,
      maxConcurrent: config.maxConcurrentTasks ?? 10,
      useTaskDevicesEngine: config.useTaskDevicesEngine,
    },
  );
  log.info(
    `[Agent] DeviceOrchestrator pcId=${supabaseSync.pcId} (UUID for claim_next_assignment)`,
  );
  deviceOrchestrator.start();
  log.info(
    "[Agent] ✓ Device orchestrator started (Realtime push + 3s fallback)",
  );

  // 15c. Task-devices SSOT runner (when USE_TASK_DEVICES_ENGINE=true)
  if (config.useTaskDevicesEngine) {
    const { TaskDevicesRunner } = require("./task-devices-runner");
    taskDevicesRunner = new TaskDevicesRunner(supabaseSync, xiaowei, config, {
      watchAdapter: (deviceTarget, cfg) =>
        taskExecutor.runWatchForDevice(deviceTarget, cfg),
    });
    taskDevicesRunner.start();
    log.info("[Agent] ✓ Task-devices runner started (SSOT engine)");
  }

  videoDispatcher = new VideoDispatcher(supabaseSync, config, broadcaster);
  if (config.isPrimaryPc && !config.useTaskDevicesEngine) {
    // Wire push: VideoDispatcher creates job_assignments → nudge DeviceOrchestrator (legacy only)
    videoDispatcher.on("nudge", () => {
      if (deviceOrchestrator) {
        log.info("[Agent] ⚡ VideoDispatcher → nudge → DeviceOrchestrator");
        deviceOrchestrator.nudge();
      }
    });
    videoDispatcher.start();
    log.info(
      "[Agent] ✓ Video dispatcher started (Realtime push + 60s fallback)",
    );
  } else if (config.useTaskDevicesEngine) {
    log.info(
      "[Agent] - Video dispatcher skipped (USE_TASK_DEVICES_ENGINE: job_assignments disabled)",
    );
  } else {
    log.info(
      "[Agent] - Video dispatcher skipped (not primary PC). Set IS_PRIMARY_PC=true to create job_assignments.",
    );
  }

  // 13a. Poll pending job_assignments only when not using task_devices engine and not DeviceOrchestrator
  if (config.useTaskDevicesEngine) {
    log.info(
      "[Agent] - Job assignment polling skipped (USE_TASK_DEVICES_ENGINE)",
    );
  } else if (!deviceOrchestrator) {
    taskExecutor.startJobAssignmentPolling(15000);
    log.info("[Agent] ✓ Job assignment polling started");
  } else {
    log.info(
      "[Agent] - Job assignment polling skipped (DeviceOrchestrator active)",
    );
  }

  // 16. Wire up config-updated listeners for dynamic interval changes
  config.on("config-updated", ({ key, oldValue, newValue }) => {
    // heartbeat_interval → restart heartbeat loop
    if (key === "heartbeat_interval" && heartbeatHandle) {
      clearInterval(heartbeatHandle);
      heartbeatHandle = startHeartbeat(
        xiaowei,
        supabaseSync,
        config,
        taskExecutor,
        broadcaster,
        reconnectManager,
        () => deviceOrchestrator,
      );
      log.info(`[Agent] Heartbeat restarted with interval ${newValue}ms`);
    }

    // adb_reconnect_interval → restart ADB reconnect loop
    if (key === "adb_reconnect_interval" && reconnectManager) {
      reconnectManager.stop();
      reconnectManager.reconnectInterval = newValue;
      reconnectManager.start();
      log.info(`[Agent] ADB reconnect restarted with interval ${newValue}ms`);
    }

    // proxy_check_interval or proxy_policy → restart proxy check loop
    if (
      (key === "proxy_check_interval" || key === "proxy_policy") &&
      proxyManager
    ) {
      proxyManager.applyConfigChange(key, newValue);
    }

    // max_concurrent_tasks → update task executor limit
    if (key === "max_concurrent_tasks" && taskExecutor) {
      taskExecutor.maxConcurrent = newValue;
      log.info(`[Agent] TaskExecutor maxConcurrent updated to ${newValue}`);
    }

    // max_retry_count → update task executor (if it uses it)
    if (key === "max_retry_count" && taskExecutor) {
      taskExecutor.maxRetryCount = newValue;
      log.info(`[Agent] TaskExecutor maxRetryCount updated to ${newValue}`);
    }
  });

  // Health check HTTP server (for PM2 / external probes)
  const healthPort = parseInt(process.env.AGENT_HEALTH_PORT || "9100", 10);
  const http = require("http");
  healthServer = http.createServer(async (req, res) => {
    if (req.url !== "/" && req.url !== "/health") {
      res.writeHead(404);
      res.end();
      return;
    }
    let lastHeartbeatAt = null;
    let lastHeartbeatAgeSec = null;
    if (supabaseSync && supabaseSync.pcId) {
      try {
        const { data: row } = await supabaseSync.supabase
          .from("pcs")
          .select("last_heartbeat")
          .eq("id", supabaseSync.pcId)
          .maybeSingle();
        if (row && row.last_heartbeat) {
          lastHeartbeatAt = row.last_heartbeat;
          lastHeartbeatAgeSec = Math.round(
            (Date.now() - new Date(row.last_heartbeat).getTime()) / 1000,
          );
        }
      } catch (_) {}
    }
    const xiaoweiConnected = xiaowei ? xiaowei.connected : false;
    const ok =
      xiaoweiConnected &&
      lastHeartbeatAgeSec !== null &&
      lastHeartbeatAgeSec < 120;
    res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        ok,
        xiaowei: xiaoweiConnected,
        lastHeartbeatAt,
        lastHeartbeatAgeSec,
      }),
    );
  });
  healthServer.listen(healthPort, "127.0.0.1", () => {
    log.info(
      `[Agent] Health check listening on http://127.0.0.1:${healthPort}/`,
    );
  });

  log.info("[Agent] Ready and listening for tasks");
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  log.info("\n[Agent] Shutting down gracefully...");

  if (healthServer) {
    healthServer.close();
    healthServer = null;
  }

  // Stop stale task cleaner
  if (staleTaskCleaner) {
    staleTaskCleaner.stop();
  }

  // Stop device orchestrator
  if (deviceOrchestrator) {
    if (deviceOrchestrator) deviceOrchestrator.stop();
    if (taskDevicesRunner) {
      taskDevicesRunner.stop();
      taskDevicesRunner = null;
    }
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
  if (taskQueuePollHandle) {
    clearInterval(taskQueuePollHandle);
    taskQueuePollHandle = null;
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
      log.info("[Agent] PC status set to offline");
    } catch (err) {
      log.error(`[Agent] Failed to update offline status: ${err.message}`);
    }
  }

  // Disconnect Xiaowei
  if (xiaowei) {
    xiaowei.disconnect();
  }

  log.info("[Agent] Shutdown complete");
  process.exit(0);
}

// Handle termination signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Handle uncaught errors (keep agent alive). 명세 4.1 에러 로그 → Supabase command_logs
process.on("uncaughtException", (err) => {
  log.error(`[Agent] Uncaught exception: ${err.message}`);
  log.error(err.stack);
  if (supabaseSync && typeof supabaseSync.insertAgentErrorLog === "function") {
    supabaseSync
      .insertAgentErrorLog(err.message, { stack: err.stack })
      .catch(() => {});
  }
});

process.on("unhandledRejection", (reason) => {
  log.error(`[Agent] Unhandled rejection: ${reason}`);
  if (supabaseSync && typeof supabaseSync.insertAgentErrorLog === "function") {
    const msg = reason instanceof Error ? reason.message : String(reason);
    supabaseSync
      .insertAgentErrorLog(msg, { type: "unhandledRejection" })
      .catch(() => {});
  }
});

// Start
main().catch((err) => {
  log.error(`[Agent] Fatal error: ${err.message}`);
  process.exit(1);
});
