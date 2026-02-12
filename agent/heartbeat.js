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
 * @returns {NodeJS.Timeout} interval handle
 */
function startHeartbeat(xiaowei, supabaseSync, config) {
  const workerId = supabaseSync.workerId;
  const interval = config.heartbeatInterval || 30000;

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

      // 2. Update worker status
      await supabaseSync.updateWorkerStatus(
        workerId,
        "online",
        devices.length,
        xiaowei.connected
      );

      // 3. Upsert each device
      const activeSerials = [];
      for (const device of devices) {
        if (!device.serial) continue;
        activeSerials.push(device.serial);
        await supabaseSync.upsertDevice(
          device.serial,
          workerId,
          device.status,
          device.model,
          device.battery,
          device.ipIntranet
        );
      }

      // 4. Mark disconnected devices as offline
      await supabaseSync.markOfflineDevices(workerId, activeSerials);

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
