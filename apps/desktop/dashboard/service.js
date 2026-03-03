/**
 * agent/dashboard/service.js — 대시보드 데이터 + Supabase Broadcast
 *
 * 실시간 상태, 미션 리포트, 에러 요약, 계정/프록시 건강도.
 * Agent 측에서 데이터 집계 + Broadcast 발행.
 * 웹 대시보드는 Next.js API Routes에서 Supabase 직접 쿼리.
 */
const { getLogger } = require('../common/logger');
const { deviceModels, pcModels } = require('../device/models');
const { accountModels } = require('../account/models');
const { proxyModels } = require('../proxy/models');
const { videoModels } = require('../video-manager/models');

const log = getLogger('dashboard.service');

class DashboardService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {string} pcId
   */
  constructor(supabase, pcId) {
    this.supabase = supabase;
    this.pcId = pcId;
  }

  // ═══════════════════════════════════════════════════════
  // 실시간 상태
  // ═══════════════════════════════════════════════════════

  /**
   * 실시간 대시보드 데이터 (전체 시스템)
   * @returns {Promise<object>}
   */
  async getRealtimeStatus() {
    const [allPcs, deviceCounts, todayStats, missionStats] = await Promise.all([
      pcModels.listAll(),
      this._getAllDeviceCounts(),
      this._getTodayStats(),
      videoModels.getActiveMissions ? this._getMissionCounts() : {},
    ]);

    // PC별 요약
    const perPc = [];
    for (const pc of allPcs) {
      const counts = await deviceModels.countByPc(pc.id);
      perPc.push({
        pc: pc.pc_number,
        pcId: pc.id,
        status: pc.status,
        ...counts,
      });
    }

    return {
      totalDevices: deviceCounts.total,
      online: deviceCounts.online,
      offline: deviceCounts.offline,
      busy: deviceCounts.busy,
      error: deviceCounts.error,
      activeMissions: missionStats.active || 0,
      todayStats,
      perPc,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * 일별 미션 리포트 (task_devices SSOT — 완료/실패 집계)
   * @param {string} [date] - YYYY-MM-DD (기본: 오늘)
   * @returns {Promise<object>}
   */
  async getMissionReport(date) {
    const targetDate = date || new Date().toISOString().slice(0, 10);
    const startOfDay = `${targetDate}T00:00:00.000Z`;
    const endOfDay = `${targetDate}T23:59:59.999Z`;

    const { data: rows, error } = await this.supabase
      .from('task_devices')
      .select('id, status, completed_at, duration_ms, result')
      .gte('completed_at', startOfDay)
      .lte('completed_at', endOfDay);

    if (error) { log.error('mission_report_failed', { error: error.message }); return {}; }

    const list = rows || [];
    const completed = list.filter(r => r.status === 'completed' || r.status === 'done');
    const failed = list.filter(r => r.status === 'failed');

    const likes = completed.filter(r => r.result && typeof r.result === 'object' && r.result.liked).length;
    const comments = completed.filter(r => r.result && typeof r.result === 'object' && r.result.commented).length;
    const playlists = completed.filter(r => r.result && typeof r.result === 'object' && r.result.playlisted).length;

    return {
      date: targetDate,
      total: list.length,
      completed: completed.length,
      failed: failed.length,
      avgWatchSec: completed.length > 0
        ? Math.round(completed.reduce((s, r) => s + (r.duration_ms || 0) / 1000, 0) / completed.length)
        : 0,
      avgWatchPct: completed.length > 0
        ? Math.round(completed.reduce((s, r) => s + (r.result && r.result.watchPercentage ? r.result.watchPercentage : 0), 0) / completed.length)
        : 0,
      likes,
      comments,
      playlists,
    };
  }

  /**
   * 최근 N시간 에러 요약
   * @param {number} [hours=24]
   * @returns {Promise<Array<{type, count, severity, lastOccurred}>>}
   */
  async getErrorSummary(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('execution_logs')
      .select('message, level, data, created_at')
      .eq('status', 'failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) { log.error('error_summary_failed', { error: error.message }); return []; }

    // 에러 유형별 집계
    const typeMap = new Map();
    for (const row of data || []) {
      const type = _classifyError(row.message || '');
      const existing = typeMap.get(type) || { type, count: 0, severity: row.level || 'error', lastOccurred: null };
      existing.count++;
      if (!existing.lastOccurred) existing.lastOccurred = row.created_at;
      typeMap.set(type, existing);
    }

    return Array.from(typeMap.values()).sort((a, b) => b.count - a.count);
  }

  /**
   * 계정 풀 건강도
   * @returns {Promise<object>}
   */
  async getAccountHealth() {
    return accountModels.getPoolStatus();
  }

  /**
   * 프록시 풀 건강도
   * @param {string} [pcId]
   * @returns {Promise<object>}
   */
  async getProxyHealth(pcId) {
    return proxyModels.getPoolStatus(pcId);
  }

  // ═══════════════════════════════════════════════════════
  // Broadcast 발행
  // ═══════════════════════════════════════════════════════

  /**
   * 시스템 이벤트 발행 (room:system)
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
   * PC 스냅샷 발행 (room:worker:pcId)
   */
  async publishSnapshot(snapshot) {
    try {
      const channel = this.supabase.channel(`room:worker:${this.pcId}`);
      await channel.send({
        type: 'broadcast',
        event: 'snapshot',
        payload: { pcId: this.pcId, ...snapshot, timestamp: new Date().toISOString() },
      });
      this.supabase.removeChannel(channel);
    } catch (err) {
      log.warn('snapshot_failed', { error: err.message });
    }
  }

  /**
   * 태스크 로그 발행 (room:task:id:logs)
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
    log.info('dashboard_cleanup');
  }

  // ═══════════════════════════════════════════════════════
  // Private
  // ═══════════════════════════════════════════════════════

  async _getAllDeviceCounts() {
    const { count: total } = await this.supabase.from('devices').select('*', { count: 'exact', head: true });
    const counts = { total: total || 0, online: 0, offline: 0, busy: 0, error: 0 };
    for (const s of ['online', 'offline', 'busy', 'error']) {
      const { count } = await this.supabase.from('devices').select('*', { count: 'exact', head: true }).eq('status', s);
      counts[s] = count || 0;
    }
    return counts;
  }

  async _getTodayStats() {
    const today = new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z';

    const { count: views } = await this.supabase
      .from('task_devices').select('*', { count: 'exact', head: true })
      .in('status', ['completed', 'done']).gte('completed_at', today);

    const { count: errors } = await this.supabase
      .from('task_devices').select('*', { count: 'exact', head: true })
      .eq('status', 'failed').gte('created_at', today);

    const { data: completedRows } = await this.supabase
      .from('task_devices').select('result')
      .in('status', ['completed', 'done']).gte('completed_at', today);

    let likes = 0;
    let comments = 0;
    for (const r of completedRows || []) {
      if (r.result && typeof r.result === 'object') {
        if (r.result.liked) likes++;
        if (r.result.commented) comments++;
      }
    }

    return {
      views: views || 0,
      likes,
      comments,
      errors: errors || 0,
    };
  }

  async _getMissionCounts() {
    const counts = {};
    for (const s of ['active', 'paused', 'completed']) {
      const { count } = await this.supabase.from('videos').select('*', { count: 'exact', head: true }).eq('status', s);
      counts[s] = count || 0;
    }
    return counts;
  }
}

/** 에러 메시지 → 유형 분류 */
function _classifyError(message) {
  const msg = message.toLowerCase();
  if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
  if (msg.includes('adb') || msg.includes('xiaowei')) return 'adb_connection';
  if (msg.includes('proxy')) return 'proxy';
  if (msg.includes('account') || msg.includes('banned') || msg.includes('login')) return 'account';
  if (msg.includes('youtube') || msg.includes('playback')) return 'youtube';
  if (msg.includes('bot') || msg.includes('captcha') || msg.includes('detection')) return 'bot_detection';
  if (msg.includes('supabase') || msg.includes('database')) return 'database';
  return 'other';
}

module.exports = { DashboardService };
