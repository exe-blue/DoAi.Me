/**
 * DoAi.Me - Dashboard Broadcaster
 * Publishes real-time dashboard snapshots and system events via Supabase Broadcast
 * Aggregates device state changes to reduce event spam
 */

class DashboardBroadcaster {
  constructor(supabase, pcId) {
    this.supabase = supabase;
    this.pcId = pcId;
    this.dashboardChannel = null;
    this.systemChannel = null;
    this.devicesChannel = null;
    this.previousDeviceStates = new Map(); // serial → status
  }

  /**
   * Initialize broadcast channels
   * @returns {Promise<void>}
   */
  async init() {
    console.log('[Broadcaster] Initializing channels...');

    // Create persistent broadcast channels
    this.dashboardChannel = this.supabase.channel('room:dashboard');
    this.systemChannel = this.supabase.channel('room:system');
    this.devicesChannel = this.supabase.channel('room:devices');

    await this.dashboardChannel.subscribe();
    await this.systemChannel.subscribe();
    await this.devicesChannel.subscribe();

    console.log('[Broadcaster] ✓ Channels initialized (room:dashboard, room:system, room:devices)');
  }

  /**
   * Publish aggregated dashboard snapshot
   * @param {object} snapshot - Complete dashboard state
   * @returns {Promise<void>}
   */
  async publishDashboardSnapshot(snapshot) {
    if (!this.dashboardChannel) {
      console.warn('[Broadcaster] Dashboard channel not initialized');
      return;
    }

    try {
      await this.dashboardChannel.send({
        type: 'broadcast',
        event: 'dashboard_snapshot',
        payload: snapshot
      });
    } catch (err) {
      console.error(`[Broadcaster] Failed to publish snapshot: ${err.message}`);
    }
  }

  /**
   * Publish system event
   * @param {string} eventType - Event type (device_offline, device_recovered, etc.)
   * @param {string} message - Human-readable message
   * @param {object} details - Additional event details
   * @returns {Promise<void>}
   */
  async publishSystemEvent(eventType, message, details = {}) {
    if (!this.systemChannel) {
      console.warn('[Broadcaster] System channel not initialized');
      return;
    }

    try {
      await this.systemChannel.send({
        type: 'broadcast',
        event: 'event',
        payload: {
          type: 'event',
          event_type: eventType,
          message,
          details,
          timestamp: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error(`[Broadcaster] Failed to publish event: ${err.message}`);
    }
  }

  /**
   * Broadcast device list to room:devices for dashboard real-time updates
   * @param {string} workerId - Worker/PC UUID (for dashboard to match node.id)
   * @param {Array<{serial: string, status: string, model?: string, battery?: number}>} devices
   * @returns {Promise<void>}
   */
  async broadcastWorkerDevices(workerId, devices) {
    if (!this.devicesChannel) return;
    try {
      await this.devicesChannel.send({
        type: 'broadcast',
        event: 'update',
        payload: { worker_id: workerId, devices }
      });
    } catch (err) {
      console.error(`[Broadcaster] Failed to broadcast devices: ${err.message}`);
    }
  }

  /**
   * Detect device state changes and batch publish events
   * @param {Array<{serial: string, status: string}>} currentDevices
   * @returns {{offline: string[], recovered: string[]}}
   */
  async detectAndPublishChanges(currentDevices) {
    const changes = { offline: [], recovered: [] };
    const currentMap = new Map(currentDevices.map(d => [d.serial, d.status]));

    // Check for devices that went offline
    for (const [serial, prevStatus] of this.previousDeviceStates) {
      if (!currentMap.has(serial) && prevStatus === 'online') {
        changes.offline.push(serial);
      }
    }

    // Check for recovered devices
    for (const [serial, status] of currentMap) {
      const prev = this.previousDeviceStates.get(serial);
      if (prev && prev !== 'online' && status === 'online') {
        changes.recovered.push(serial);
      }
    }

    // Batch publish (1 event per type, not per device)
    if (changes.offline.length > 0) {
      await this.publishSystemEvent('device_offline',
        `${changes.offline.length} device(s) disconnected`,
        { serials: changes.offline, count: changes.offline.length });
    }
    if (changes.recovered.length > 0) {
      await this.publishSystemEvent('device_recovered',
        `${changes.recovered.length} device(s) reconnected`,
        { serials: changes.recovered, count: changes.recovered.length });
    }

    // Update state tracking
    this.previousDeviceStates = currentMap;
    return changes;
  }

  /**
   * Clean up broadcast channels
   * @returns {Promise<void>}
   */
  async cleanup() {
    console.log('[Broadcaster] Cleaning up channels...');

    if (this.dashboardChannel) {
      await this.supabase.removeChannel(this.dashboardChannel);
      this.dashboardChannel = null;
    }
    if (this.systemChannel) {
      await this.supabase.removeChannel(this.systemChannel);
      this.systemChannel = null;
    }
    if (this.devicesChannel) {
      await this.supabase.removeChannel(this.devicesChannel);
      this.devicesChannel = null;
    }

    console.log('[Broadcaster] ✓ Channels cleaned up');
  }
}

module.exports = DashboardBroadcaster;
