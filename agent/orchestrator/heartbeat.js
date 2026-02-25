/**
 * agent/orchestrator/heartbeat.js — PC/기기 상태 주기적 보고
 *
 * N초마다 Xiaowei에서 기기 목록 조회 → Supabase에 상태 업데이트.
 */
const { getLogger } = require('../common/logger');

const log = getLogger('orchestrator.heartbeat');

class HeartbeatManager {
  /**
   * @param {import('../device/service').DeviceService} deviceService
   * @param {object} config
   */
  constructor(deviceService, config) {
    this.deviceService = deviceService;
    this.config = config;
    this._interval = null;
    this._running = false;
  }

  /** 하트비트 루프 시작 */
  start() {
    const ms = this.config.heartbeatInterval || 30000;
    if (this._interval) return;

    this._interval = setInterval(() => this._tick(), ms);
    log.info('heartbeat_started', { intervalMs: ms });

    // 첫 실행
    this._tick();
  }

  /** 중지 */
  stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    log.info('heartbeat_stopped');
  }

  /** @private 하트비트 틱 */
  async _tick() {
    if (this._running) return;
    this._running = true;

    try {
      // 기기 탐색 + 등록/업데이트
      const { registered, devices } = await this.deviceService.discoverAndRegister();

      // PC 상태 업데이트
      const { pcModels } = require('../device/models');
      if (this.deviceService.pcId) {
        await pcModels.updateStatus(this.deviceService.pcId, 'online');
      }

      log.debug('heartbeat_tick', { devices: registered });
    } catch (err) {
      log.error('heartbeat_error', { error: err.message });
    } finally {
      this._running = false;
    }
  }
}

module.exports = { HeartbeatManager };
