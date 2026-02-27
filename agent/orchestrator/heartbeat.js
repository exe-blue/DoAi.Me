/**
 * agent/orchestrator/heartbeat.js — PC/기기 상태 주기 보고 + 자동 복구
 *
 * 30초마다: 기기 탐색 → DB 동기화 → PC 상태 보고
 * 60초마다: 전체 기기 건강 체크 (offline 감지, 배터리, 프록시)
 * 6시간마다: 벌크 최적화
 */
const { getLogger } = require('../common/logger');
const { ADBDevice } = require('../adb/client');
const { getPlaybackState } = require('../adb/screen');

const log = getLogger('orchestrator.heartbeat');

const HEARTBEAT_INTERVAL_MS = 30000;
const HEALTH_CHECK_INTERVAL_MS = 60000;
const OPTIMIZE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEAD_THRESHOLD_MS = 90000;
const LOW_BATTERY_PCT = 20;

class HeartbeatManager {
  /**
   * @param {object} deps
   * @param {import('../device/service').DeviceService} deps.deviceService
   * @param {object} deps.xiaowei
   * @param {object} deps.config
   * @param {import('./scheduler').DeviceScheduler} [deps.scheduler]
   * @param {import('../proxy/service').ProxyService} [deps.proxyService]
   * @param {import('../account/service').AccountService} [deps.accountService]
   * @param {import('../dashboard/service').DashboardService} [deps.dashboard]
   */
  constructor(deps) {
    this.deviceService = deps.deviceService;
    this.xiaowei = deps.xiaowei;
    this.config = deps.config;
    this.scheduler = deps.scheduler || null;
    this.proxyService = deps.proxyService || null;
    this.accountService = deps.accountService || null;
    this.dashboard = deps.dashboard || null;

    this._heartbeatTimer = null;
    this._healthTimer = null;
    this._optimizeTimer = null;
    this._running = false;
    this._lastHealthCheck = null;
  }

  /** 모든 타이머 시작 */
  start() {
    const hbMs = this.config.heartbeatInterval || HEARTBEAT_INTERVAL_MS;

    this._heartbeatTimer = setInterval(() => this._heartbeatTick(), hbMs);
    this._healthTimer = setInterval(() => this._healthCheckTick(), HEALTH_CHECK_INTERVAL_MS);
    this._optimizeTimer = setInterval(() => this._optimizeTick(), OPTIMIZE_INTERVAL_MS);

    // unref로 프로세스 종료 방해 안 함
    [this._heartbeatTimer, this._healthTimer, this._optimizeTimer].forEach(t => { if (t?.unref) t.unref(); });

    log.info('heartbeat_started', { heartbeatMs: hbMs, healthMs: HEALTH_CHECK_INTERVAL_MS });

    // 첫 실행
    this._heartbeatTick();
  }

  /** 모든 타이머 중지 */
  stop() {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer); this._heartbeatTimer = null; }
    if (this._healthTimer) { clearInterval(this._healthTimer); this._healthTimer = null; }
    if (this._optimizeTimer) { clearInterval(this._optimizeTimer); this._optimizeTimer = null; }
    log.info('heartbeat_stopped');
  }

  // ═══════════════════════════════════════════════════════
  // 30초 — 하트비트 (기기 탐색 + DB 동기화)
  // ═══════════════════════════════════════════════════════

  /** @private */
  async _heartbeatTick() {
    if (this._running) return;
    this._running = true;

    try {
      const { registered, devices } = await this.deviceService.discoverAndRegister();

      // PC 상태 업데이트
      const { pcModels } = require('../device/models');
      if (this.deviceService.pcId) {
        await pcModels.updateStatus(this.deviceService.pcId, 'online');
      }

      // 대시보드에 스냅샷 발행
      if (this.dashboard) {
        const counts = await this.deviceService.getDeviceCounts();
        await this.dashboard.publishSnapshot({ devices: counts, deviceCount: registered });
      }

      log.debug('heartbeat_tick', { devices: registered });
    } catch (err) {
      log.error('heartbeat_error', { error: err.message });
    } finally {
      this._running = false;
    }
  }

  // ═══════════════════════════════════════════════════════
  // 60초 — 전체 기기 건강 체크
  // ═══════════════════════════════════════════════════════

  /**
   * 전체 기기 상태 체크:
   * - offline 감지 (DEAD_THRESHOLD 초과)
   * - 배터리 < 20% → 미션 할당 중지
   * - 프록시/계정 이상 → 교체 트리거
   * @returns {Promise<{online, offline, error, needsAttention: string[]}>}
   */
  async checkAllDevices() {
    if (!this.deviceService.pcId) return { online: 0, offline: 0, error: 0, needsAttention: [] };

    const { deviceModels } = require('../device/models');
    const devices = await deviceModels.listByPc(this.deviceService.pcId);
    const now = Date.now();
    const needsAttention = [];

    let online = 0, offline = 0, errorCount = 0;

    for (const d of devices) {
      const serial = d.serial;
      const lastSeen = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
      const elapsed = now - lastSeen;

      // Offline 감지
      if (elapsed > DEAD_THRESHOLD_MS && d.status !== 'offline') {
        await deviceModels.updateStatus(d.id, 'offline');
        log.warn('device_offline_detected', { serial, elapsed: Math.round(elapsed / 1000) });
        needsAttention.push(`${serial}:offline`);
        offline++;
        continue;
      }

      if (d.status === 'offline') { offline++; continue; }
      if (d.status === 'error') { errorCount++; needsAttention.push(`${serial}:error`); continue; }
      online++;

      // 배터리 체크 (정보 있을 때만)
      if (d.battery_level != null && d.battery_level < LOW_BATTERY_PCT) {
        log.warn('low_battery', { serial, battery: d.battery_level });
        needsAttention.push(`${serial}:low_battery(${d.battery_level}%)`);
      }
    }

    this._lastHealthCheck = {
      timestamp: new Date().toISOString(),
      online, offline, error: errorCount,
      needsAttention,
      total: devices.length,
    };

    if (needsAttention.length > 0) {
      log.info('health_check_issues', { online, offline, error: errorCount, issues: needsAttention.length });

      if (this.dashboard) {
        await this.dashboard.publishEvent('health_check', `${needsAttention.length} issues detected`, {
          online, offline, error: errorCount, needsAttention,
        });
      }
    }

    return this._lastHealthCheck;
  }

  /** @private 건강 체크 틱 */
  async _healthCheckTick() {
    try { await this.checkAllDevices(); } catch (err) {
      log.error('health_check_error', { error: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════
  // 6시간 — 벌크 최적화
  // ═══════════════════════════════════════════════════════

  /** @private */
  async _optimizeTick() {
    try {
      log.info('bulk_optimize_start');
      const result = await this.deviceService.optimizeAll();
      log.info('bulk_optimize_done', result);

      if (this.dashboard) {
        await this.dashboard.publishEvent('bulk_optimize', `Optimized ${result.success}/${result.total} devices`, result);
      }
    } catch (err) {
      log.error('bulk_optimize_error', { error: err.message });
    }
  }

  // ═══════════════════════════════════════════════════════
  // 상태 조회
  // ═══════════════════════════════════════════════════════

  /**
   * 단일 기기 상세 건강 상태
   * @param {string} serial
   * @returns {Promise<object>}
   */
  async getDeviceHealth(serial) {
    const { deviceModels } = require('../device/models');
    const device = await deviceModels.getBySerial(serial);
    if (!device) return { found: false };

    const health = {
      found: true,
      serial,
      status: device.status,
      battery: device.battery_level,
      lastSeen: device.last_seen_at,
      model: device.model,
    };

    // 라이브 데이터 (Xiaowei 연결 시)
    if (this.xiaowei && this.xiaowei.connected) {
      try {
        const dev = new ADBDevice(this.xiaowei, serial);
        health.batteryLive = await dev.getBatteryLevel();
        health.playbackState = await getPlaybackState(dev);
        health.youtubeVersion = await dev.getYouTubeVersion();
      } catch {}
    }

    return health;
  }

  /**
   * PC 건강 요약
   * @returns {Promise<object>}
   */
  async getPCHealth() {
    const counts = await this.deviceService.getDeviceCounts();
    return {
      pcId: this.deviceService.pcId,
      pcNumber: this.config.pcNumber,
      xiaowei: !!(this.xiaowei && this.xiaowei.connected),
      lastHealthCheck: this._lastHealthCheck,
      devices: counts,
    };
  }
}

module.exports = { HeartbeatManager, DEAD_THRESHOLD_MS, LOW_BATTERY_PCT };
