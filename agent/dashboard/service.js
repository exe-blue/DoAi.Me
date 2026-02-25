/**
 * agent/dashboard/service.js — Supabase Broadcast 기반 대시보드 실시간 업데이트
 *
 * PC 상태, 기기 그리드, 태스크 진행 등을 Broadcast 채널로 publish.
 */
const { getLogger } = require('../common/logger');

const log = getLogger('dashboard.service');

class DashboardService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {string} pcId
   */
  constructor(supabase, pcId) {
    this.supabase = supabase;
    this.pcId = pcId;
    this._channels = new Map();
  }

  /**
   * 시스템 이벤트 발행
   * @param {string} eventType - e.g. 'mission_complete', 'device_error'
   * @param {string} message
   * @param {object} [data]
   */
  async publishEvent(eventType, message, data = {}) {
    try {
      const channel = this.supabase.channel('room:system');
      await channel.send({
        type: 'broadcast',
        event: 'event',
        payload: {
          type: eventType,
          message,
          data: { ...data, pcId: this.pcId },
          timestamp: new Date().toISOString(),
        },
      });
      this.supabase.removeChannel(channel);
    } catch (err) {
      log.warn('publish_failed', { eventType, error: err.message });
    }
  }

  /**
   * PC 상태 스냅샷 발행
   * @param {object} snapshot - { devices, tasks, proxies, ... }
   */
  async publishSnapshot(snapshot) {
    try {
      const channel = this.supabase.channel(`room:worker:${this.pcId}`);
      await channel.send({
        type: 'broadcast',
        event: 'snapshot',
        payload: {
          pcId: this.pcId,
          ...snapshot,
          timestamp: new Date().toISOString(),
        },
      });
      this.supabase.removeChannel(channel);
    } catch (err) {
      log.warn('snapshot_failed', { error: err.message });
    }
  }

  /**
   * 태스크 로그 발행 (실시간 로그 스트림)
   * @param {string} taskId
   * @param {object} logEntry
   */
  async publishTaskLog(taskId, logEntry) {
    try {
      await this.supabase.rpc('broadcast_to_channel', {
        p_channel: `room:task:${taskId}:logs`,
        p_event: 'insert',
        p_payload: logEntry,
      });
    } catch {}
  }

  /** 정리 */
  async cleanup() {
    for (const [, channel] of this._channels) {
      try { await this.supabase.removeChannel(channel); } catch {}
    }
    this._channels.clear();
    log.info('dashboard_cleanup');
  }
}

module.exports = { DashboardService };
