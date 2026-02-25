/**
 * agent/account/models.js — Supabase CRUD for accounts table
 *
 * 실제 스키마:
 *   accounts: { id, email, status, device_id, pc_id, worker_id,
 *     login_count, last_used, banned_at, cooldown_until, ban_reason,
 *     phone_verified, recovery_email, task_count, notes, created_at, updated_at }
 */
const { getLogger } = require('../common/logger');
const log = getLogger('account.models');

let _supabase = null;
function _db() {
  if (!_supabase) throw new Error('account/models not initialized');
  return _supabase;
}

const accountModels = {
  init(supabase) { _supabase = supabase; },

  async getById(id) {
    const { data, error } = await _db().from('accounts').select('*').eq('id', id).maybeSingle();
    if (error) { log.error('get_failed', { id, error: error.message }); return null; }
    return data;
  },

  async getByEmail(email) {
    const { data, error } = await _db().from('accounts').select('*').eq('email', email).maybeSingle();
    if (error) { log.error('get_failed', { email, error: error.message }); return null; }
    return data;
  },

  /** 사용 가능한 계정 조회 (밴 아님, 쿨다운 지남, 미할당) */
  async getAvailable(limit = 1) {
    const now = new Date().toISOString();
    const { data, error } = await _db()
      .from('accounts')
      .select('*')
      .eq('status', 'available')
      .is('device_id', null)
      .or(`cooldown_until.is.null,cooldown_until.lt.${now}`)
      .order('last_used', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) { log.error('get_available_failed', { error: error.message }); return []; }
    return data || [];
  },

  /** 계정-기기 할당 */
  async assignToDevice(accountId, deviceId) {
    const { error } = await _db()
      .from('accounts')
      .update({
        device_id: deviceId,
        status: 'in_use',
        last_used: new Date().toISOString(),
      })
      .eq('id', accountId);

    if (error) {
      log.error('assign_failed', { accountId, deviceId, error: error.message });
      return false;
    }
    log.info('assigned', { accountId, deviceId });
    return true;
  },

  /** 계정-기기 할당 해제 */
  async releaseFromDevice(accountId) {
    const { error } = await _db()
      .from('accounts')
      .update({ device_id: null, status: 'available' })
      .eq('id', accountId);

    if (error) {
      log.error('release_failed', { accountId, error: error.message });
      return false;
    }
    log.info('released', { accountId });
    return true;
  },

  /** 밴 처리 */
  async markBanned(accountId, reason) {
    const { error } = await _db()
      .from('accounts')
      .update({
        status: 'banned',
        banned_at: new Date().toISOString(),
        ban_reason: reason,
        device_id: null,
      })
      .eq('id', accountId);

    if (error) {
      log.error('ban_failed', { accountId, error: error.message });
      return false;
    }
    log.warn('account_banned', { accountId, reason });
    return true;
  },

  /** 쿨다운 설정 */
  async setCooldown(accountId, minutes) {
    const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const { error } = await _db()
      .from('accounts')
      .update({
        status: 'cooldown',
        cooldown_until: until,
        device_id: null,
      })
      .eq('id', accountId);

    if (error) {
      log.error('cooldown_failed', { accountId, error: error.message });
      return false;
    }
    log.info('cooldown_set', { accountId, minutes, until });
    return true;
  },

  /** 쿨다운 만료된 계정 자동 복구 */
  async recoverExpiredCooldowns() {
    const now = new Date().toISOString();
    const { data, error } = await _db()
      .from('accounts')
      .update({ status: 'available', cooldown_until: null })
      .eq('status', 'cooldown')
      .lt('cooldown_until', now)
      .select('id');

    if (error) {
      log.error('recover_cooldown_failed', { error: error.message });
      return 0;
    }
    const count = data?.length || 0;
    if (count > 0) log.info('cooldowns_recovered', { count });
    return count;
  },

  /** PC별 할당된 계정 목록 */
  async listByPc(pcId) {
    const { data, error } = await _db()
      .from('accounts')
      .select('*')
      .eq('pc_id', pcId)
      .not('device_id', 'is', null);

    if (error) { log.error('list_failed', { pcId, error: error.message }); return []; }
    return data || [];
  },

  /** 계정 풀 상태 카운트 */
  async getPoolStatus() {
    const statuses = ['available', 'in_use', 'banned', 'cooldown'];
    const counts = {};

    for (const s of statuses) {
      const { count, error } = await _db()
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('status', s);
      counts[s] = error ? 0 : (count || 0);
    }

    const { count: total } = await _db()
      .from('accounts')
      .select('*', { count: 'exact', head: true });
    counts.total = total || 0;

    return counts;
  },

  /** task_count 증가 */
  async incrementTaskCount(accountId) {
    const acct = await this.getById(accountId);
    if (!acct) return;
    await _db()
      .from('accounts')
      .update({ task_count: (acct.task_count || 0) + 1 })
      .eq('id', accountId);
  },
};

module.exports = { accountModels };
