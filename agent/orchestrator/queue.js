/**
 * agent/orchestrator/queue.js — Supabase 기반 미션 대기열
 *
 * Redis/BullMQ 대신 Supabase tasks/task_queue 테이블 사용 (프로젝트 규칙).
 * 우선순위 큐, 미션 상태 추적, 실패 재큐잉.
 */
const { getLogger } = require('../common/logger');
const log = getLogger('orchestrator.queue');

class MissionQueue {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * 미션을 큐에 추가
   * @param {object} mission - { videoId, keyword, watchDuration, actions, ... }
   * @param {number} [priority=5] - 우선순위 (1=낮음, 10=높음)
   * @param {string} [pcId] - 특정 PC에 할당 (null이면 아무 PC)
   * @returns {Promise<string|null>} 큐 항목 ID
   */
  async enqueue(mission, priority = 5, pcId = null) {
    const { data, error } = await this.supabase
      .from('task_queue')
      .insert({
        task_config: mission,
        priority,
        status: 'queued',
        ...(pcId ? { pc_id: pcId } : {}),
      })
      .select('id')
      .single();

    if (error) {
      log.error('enqueue_failed', { error: error.message });
      return null;
    }

    log.info('enqueued', { queueId: data.id, priority, keyword: mission.keyword });
    return data.id;
  }

  /**
   * 큐에서 가장 높은 우선순위 미션 1개 꺼냄 (atomic claim)
   * @param {string} [pcId] - 이 PC용 미션만
   * @returns {Promise<object|null>} { id, task_config, priority }
   */
  async dequeue(pcId) {
    let query = this.supabase
      .from('task_queue')
      .select('*')
      .eq('status', 'queued')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1);

    if (pcId) {
      query = query.or(`pc_id.eq.${pcId},pc_id.is.null`);
    }

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    const item = data[0];

    // Atomic claim: queued → dispatched
    const { data: claimed, error: claimErr } = await this.supabase
      .from('task_queue')
      .update({ status: 'dispatched', dispatched_at: new Date().toISOString() })
      .eq('id', item.id)
      .eq('status', 'queued')
      .select('id')
      .maybeSingle();

    if (claimErr || !claimed) return null;

    log.info('dequeued', { queueId: item.id, priority: item.priority });
    return item;
  }

  /**
   * 큐 상태 요약
   * @returns {Promise<{queued, dispatched, completed, failed}>}
   */
  async getStatus() {
    const statuses = ['queued', 'dispatched', 'completed', 'failed'];
    const counts = {};

    for (const s of statuses) {
      const { count } = await this.supabase
        .from('task_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', s);
      counts[s] = count || 0;
    }

    return counts;
  }

  /**
   * 미션 취소
   * @param {string} queueId
   */
  async cancel(queueId) {
    const { error } = await this.supabase
      .from('task_queue')
      .update({ status: 'cancelled' })
      .eq('id', queueId)
      .in('status', ['queued', 'dispatched']);

    if (error) { log.error('cancel_failed', { queueId, error: error.message }); return false; }
    log.info('cancelled', { queueId });
    return true;
  }

  /**
   * 실패 미션 재큐잉
   * @returns {Promise<number>} 재큐잉 수
   */
  async retryFailed() {
    const { data, error } = await this.supabase
      .from('task_queue')
      .update({ status: 'queued', dispatched_at: null })
      .eq('status', 'failed')
      .select('id');

    if (error) { log.error('retry_failed', { error: error.message }); return 0; }
    const count = data?.length || 0;
    if (count > 0) log.info('retried_failed', { count });
    return count;
  }
}

module.exports = { MissionQueue };
