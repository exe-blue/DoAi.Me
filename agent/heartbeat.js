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
  const pcId = supabaseSync.pcId;
  const interval = config.heartbeatInterval || 30000;
  const startedAt = new Date().toISOString();

  console.log(
    `[Heartbeat] Starting (every ${interval / 1000}s) for PC ${pcId}`
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

      // 2. Update PC status
      const uptimeSec = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);

      await supabaseSync.updatePcStatus(pcId, "online");

      // 4. Batch upsert all devices in a single query
      const activeSerials = devices.filter(d => d.serial).map(d => d.serial);
      await supabaseSync.batchUpsertDevices(devices, pcId);

      // 4a. Update reconnect manager with current device list
      if (reconnectManager) {
        reconnectManager.updateRegisteredDevices(devices);
      }

      // 5. Mark disconnected devices as offline
      await supabaseSync.markOfflineDevices(pcId, activeSerials);

      // 6. Get aggregate counts for dashboard snapshot
      if (broadcaster) {
        try {
          const deviceCounts = await supabaseSync.getDeviceCounts(pcId);
          const taskCounts = await supabaseSync.getTaskCounts(pcId);
          const proxyCounts = await supabaseSync.getProxyCounts(pcId);

          // Detect and publish device state changes
          await broadcaster.detectAndPublishChanges(devices);

          // Build and publish dashboard snapshot
          await broadcaster.publishDashboardSnapshot({
            type: 'dashboard_snapshot',
            worker: {
              id: pcId,
              name: config.pcNumber,
              status: 'online',
              uptime_seconds: uptimeSec,
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
