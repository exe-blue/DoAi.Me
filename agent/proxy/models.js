/**
 * agent/proxy/models.js — Supabase CRUD for proxies table
 *
 * 실제 스키마:
 *   proxies: { id, address (UNIQUE), type, status, assigned_count,
 *     worker_id, device_id, pc_id, device_serial,
 *     fail_count, last_checked, last_error, location, provider,
 *     max_devices, username, password, password_secret_id, created_at, updated_at }
 */
const { getLogger } = require('../common/logger');
const log = getLogger('proxy.models');

let _supabase = null;
function _db() {
  if (!_supabase) throw new Error('proxy/models not initialized');
  return _supabase;
}

const proxyModels = {
  init(supabase) { _supabase = supabase; },

  async getById(id) {
    const { data, error } = await _db().from('proxies').select('*').eq('id', id).maybeSingle();
    if (error) { log.error('get_failed', { id, error: error.message }); return null; }
    return data;
  },

  /** 사용 가능한 프록시 (active, 미할당 또는 할당 여유) */
  async getAvailable(limit = 1) {
    const { data, error } = await _db()
      .from('proxies')
      .select('*')
      .in('status', ['active', 'valid'])
      .is('device_id', null)
      .order('fail_count', { ascending: true })
      .order('last_checked', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) { log.error('get_available_failed', { error: error.message }); return []; }
    return data || [];
  },

  /** 기기에 할당 */
  async assignToDevice(proxyId, deviceId, deviceSerial) {
    const { error } = await _db()
      .from('proxies')
      .update({
        device_id: deviceId,
        device_serial: deviceSerial || null,
        status: 'active',
      })
      .eq('id', proxyId);

    if (error) {
      log.error('assign_failed', { proxyId, deviceId, error: error.message });
      return false;
    }
    log.info('assigned', { proxyId, deviceId });
    return true;
  },

  /** 기기에서 해제 */
  async releaseFromDevice(proxyId) {
    const { error } = await _db()
      .from('proxies')
      .update({ device_id: null, device_serial: null })
      .eq('id', proxyId);

    if (error) {
      log.error('release_failed', { proxyId, error: error.message });
      return false;
    }
    return true;
  },

  /** 상태 업데이트 + 헬스체크 결과 */
  async updateHealth(proxyId, status, failCount, lastError) {
    const update = {
      status,
      last_checked: new Date().toISOString(),
    };
    if (failCount !== undefined) update.fail_count = failCount;
    if (lastError !== undefined) update.last_error = lastError;

    const { error } = await _db().from('proxies').update(update).eq('id', proxyId);
    if (error) log.error('health_update_failed', { proxyId, error: error.message });
  },

  /** fail_count 증가 */
  async incrementFailCount(proxyId) {
    const proxy = await this.getById(proxyId);
    if (!proxy) return;
    const newCount = (proxy.fail_count || 0) + 1;
    await this.updateHealth(proxyId, newCount >= 3 ? 'invalid' : proxy.status, newCount);
    return newCount;
  },

  /** dead 마킹 */
  async markDead(proxyId) {
    await this.updateHealth(proxyId, 'invalid', undefined, 'marked dead');
    // 할당 해제
    await this.releaseFromDevice(proxyId);
    log.warn('proxy_dead', { proxyId });
  },

  /** PC별 프록시 목록 */
  async listByPc(pcId) {
    const { data, error } = await _db()
      .from('proxies')
      .select('*')
      .eq('pc_id', pcId);

    if (error) { log.error('list_failed', { pcId, error: error.message }); return []; }
    return data || [];
  },

  /** 풀 상태 카운트 */
  async getPoolStatus(pcId) {
    const counts = { total: 0, active: 0, invalid: 0, unassigned: 0 };

    let query = _db().from('proxies').select('*', { count: 'exact', head: true });
    if (pcId) query = query.eq('pc_id', pcId);
    const { count: total } = await query;
    counts.total = total || 0;

    for (const s of ['active', 'valid']) {
      let q = _db().from('proxies').select('*', { count: 'exact', head: true }).eq('status', s);
      if (pcId) q = q.eq('pc_id', pcId);
      const { count } = await q;
      counts.active += count || 0;
    }

    let uq = _db().from('proxies').select('*', { count: 'exact', head: true }).is('device_serial', null);
    if (pcId) uq = uq.eq('pc_id', pcId);
    const { count: unassigned } = await uq;
    counts.unassigned = unassigned || 0;

    let iq = _db().from('proxies').select('*', { count: 'exact', head: true }).eq('status', 'invalid');
    if (pcId) iq = iq.eq('pc_id', pcId);
    const { count: invalid } = await iq;
    counts.invalid = invalid || 0;

    return counts;
  },
};

module.exports = { proxyModels };
