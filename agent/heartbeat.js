/**
 * DoAi.Me - Heartbeat Loop
 * Periodically syncs device status and worker health to Supabase
 */

/**
 * Parse device list from Xiaowei response
 * @param {object} response - Xiaowei list() response
 * @returns {Array<{serial: string, model: string, status: string, battery: number|null, ipIntranet: string|null}>}
 */
function parseDeviceList(response) {
  // Xiaowei list response may vary; normalize to array of device objects
  if (!response) return [];

  // If response is an array directly
  if (Array.isArray(response)) {
    return response.map(normalizeDevice);
  }

  // If devices are under a key like 'data', 'devices', or 'list'
  const devices = response.data || response.devices || response.list;
  if (Array.isArray(devices)) {
    return devices.map(normalizeDevice);
  }

  // If response contains a device map (serial -> info)
  if (typeof response === "object" && !Array.isArray(response)) {
    const entries = Object.entries(response).filter(
      ([key]) => !["action", "status", "code", "msg"].includes(key)
    );
    if (entries.length > 0) {
      return entries.map(([serial, info]) => ({
        serial,
        model: (info && info.model) || "",
        status: "online",
        battery: (info && info.battery) || null,
        ipIntranet: (info && info.ip) || null,
      }));
    }
  }

  return [];
}

function normalizeDevice(d) {
  return {
    serial: d.serial || d.id || d.deviceId || "",
    model: d.model || d.name || "",
    status: "online",
    battery: d.battery || null,
    ipIntranet: d.ip || d.ipIntranet || null,
  };
}

/**
 * Start the heartbeat loop
 * @param {import('./xiaowei-client')} xiaowei
 * @param {import('./supabase-sync')} supabaseSync
 * @param {object} config
 * @param {import('./task-executor')|null} taskExecutor - optional, for stats reporting
 * @param {import('./dashboard-broadcaster')|null} broadcaster - optional, for real-time dashboard updates
 * @param {import('./adb-reconnect')|null} reconnectManager - optional, for updating registered devices
 * @returns {NodeJS.Timeout} interval handle
 */
function startHeartbeat(xiaowei, supabaseSync, config, taskExecutor, broadcaster, reconnectManager) {
  const workerId = supabaseSync.workerId;
  const interval = config.heartbeatInterval || 30000;
  const startedAt = new Date().toISOString();

  console.log(
    `[Heartbeat] Starting (every ${interval / 1000}s) for worker ${workerId}`
  );

  async function beat() {
    try {
      // 1. Get device list from Xiaowei
      let devices = [];
      if (xiaowei.connected) {
        try {
          const response = await xiaowei.list();
          devices = parseDeviceList(response);
        } catch (err) {
          console.error(`[Heartbeat] Failed to list devices: ${err.message}`);
        }
      }

      // 2. Build metadata with execution stats
      const metadata = {
        started_at: startedAt,
        uptime_sec: Math.round((Date.now() - new Date(startedAt).getTime()) / 1000),
        scripts_dir: config.scriptsDir || null,
      };

      // Task execution stats
      if (taskExecutor) {
        metadata.task_stats = taskExecutor.getStats();
      }

      // Subscription status
      const subStatus = supabaseSync.getSubscriptionStatus();
      metadata.subscriptions = {
        broadcast: subStatus.broadcast,
        pg_changes: subStatus.pgChanges,
        broadcast_received: subStatus.broadcastReceived,
        pg_changes_received: subStatus.pgChangesReceived,
        last_via: subStatus.lastVia,
      };

      // Log pipeline stats
      metadata.log_stats = supabaseSync.getLogStats();

      // 3. Update worker status with metadata
      await supabaseSync.updateWorkerStatus(
        workerId,
        "online",
        devices.length,
        xiaowei.connected,
        metadata
      );

      // 4. Batch upsert all devices in a single query
      const activeSerials = devices.filter(d => d.serial).map(d => d.serial);
      await supabaseSync.batchUpsertDevices(devices, workerId);

      // 4a. Update reconnect manager with current device list
      if (reconnectManager) {
        reconnectManager.updateRegisteredDevices(devices);
      }

      // 5. Mark disconnected devices as offline
      await supabaseSync.markOfflineDevices(workerId, activeSerials);

      // 6. Get aggregate counts for dashboard snapshot
      if (broadcaster) {
        try {
          const deviceCounts = await supabaseSync.getDeviceCounts(workerId);
          const taskCounts = await supabaseSync.getTaskCounts(workerId);
          const proxyCounts = await supabaseSync.getProxyCounts(workerId);

          // Detect and publish device state changes
          broadcaster.detectAndPublishChanges(devices);

          // Build and publish dashboard snapshot
          await broadcaster.publishDashboardSnapshot({
            type: 'dashboard_snapshot',
            worker: {
              id: workerId,
              name: config.workerName,
              status: 'online',
              uptime_seconds: metadata.uptime_sec,
              last_heartbeat: new Date().toISOString()
            },
            devices: deviceCounts,
            tasks: taskCounts,
            proxies: proxyCounts,
            timestamp: new Date().toISOString()
          });
        } catch (err) {
          console.error(`[Heartbeat] Broadcaster error: ${err.message}`);
        }
      }

      console.log(
        `[Heartbeat] OK - ${devices.length} device(s), xiaowei=${xiaowei.connected}`
      );
    } catch (err) {
      console.error(`[Heartbeat] Error: ${err.message}`);
    }
  }

  // Run immediately, then on interval
  beat();
  const handle = setInterval(beat, interval);
  return handle;
}

module.exports = { startHeartbeat, parseDeviceList };
