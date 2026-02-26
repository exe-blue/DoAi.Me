/**
 * DoAi.Me - Heartbeat Loop
 * Periodically syncs device status and worker health to Supabase (명세 4.3 포맷)
 */
const os = require("os");

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
 * @param {() => import('./device-orchestrator')|null} getDeviceOrchestrator - optional getter for device orchestrator (task_status sync)
 * @returns {NodeJS.Timeout} interval handle
 */
function startHeartbeat(xiaowei, supabaseSync, config, taskExecutor, broadcaster, reconnectManager, getDeviceOrchestrator) {
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

      // 2. Update PC status (명세 4.3: agent_version, status, system)
      const uptimeSec = Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
      const agentVersion = config.agentVersion || process.env.AGENT_VERSION || "0.1.0-alpha";
      const system = {
        cpu_usage: Math.min(100, Math.round((os.loadavg()[0] || 0) * 25)) || 0,
        memory_free_mb: Math.round(os.freemem() / (1024 * 1024)),
        adb_server_ok: xiaowei.connected,
        usb_devices_count: devices.length,
        uptime_seconds: uptimeSec,
      };
      await supabaseSync.updatePcStatus(pcId, "online", { agent_version: agentVersion, system });

      // 3. Batch upsert all devices (명세 4.3: device_code PC01-001 형식)
      const devicesWithCode = devices.map((d, i) => ({
        ...d,
        device_code: `${config.pcNumber}-${String(i + 1).padStart(3, "0")}`,
      }));
      const activeSerials = devices.filter(d => d.serial).map(d => d.serial);
      await supabaseSync.batchUpsertDevices(devicesWithCode, pcId);

      // 4. Sync device task states from orchestrator (task_status, watch_progress, etc.)
      const orchestrator = typeof getDeviceOrchestrator === "function" ? getDeviceOrchestrator() : null;
      if (orchestrator && typeof orchestrator.getDeviceStatesForSync === "function") {
        const stateMap = orchestrator.getDeviceStatesForSync();
        const states = Object.entries(stateMap).map(([serial, s]) => ({
          serial,
          status: s.task_status,
          assignmentId: s.current_assignment_id,
          videoTitle: s.current_video_title,
          watchProgress: s.watch_progress,
          errorCount: s.consecutive_errors,
          dailyWatchCount: s.daily_watch_count,
          dailyWatchSeconds: s.daily_watch_seconds,
        }));
        await supabaseSync.syncDeviceTaskStates(states);
      }

      // 5. Update reconnect manager with current device list
      if (reconnectManager) {
        reconnectManager.updateRegisteredDevices(devices);
      }

      // 6. Mark disconnected devices as offline
      await supabaseSync.markOfflineDevices(pcId, activeSerials);

      // 7. Get aggregate counts for dashboard snapshot
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
        `[Heartbeat] heartbeat OK - ${devices.length} device(s), xiaowei=${xiaowei.connected}`
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
