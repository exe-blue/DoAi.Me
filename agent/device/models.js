/**
 * agent/device/models.js — Supabase CRUD for pcs + devices tables
 *
 * 실제 프로덕션 스키마 기반:
 *   pcs: { id, pc_number, status, last_heartbeat, created_at }
 *   devices: { id, serial_number, pc_id, status, model, battery_level, last_seen_at, ... }
 *
 * 사용법:
 *   const { pcModels, deviceModels } = require('./device/models');
 *   pcModels.init(supabaseClient);
 *   const pc = await pcModels.getOrCreate('PC01');
 */
const { getLogger } = require('../common/logger');
const log = getLogger('device.models');

let _supabase = null;

function _db() {
  if (!_supabase) throw new Error('device/models not initialized — call init(supabase) first');
  return _supabase;
}

// ══════════════════════════════════════════════════
// PCS table
// ══════════════════════════════════════════════════

const pcModels = {
  init(supabase) { _supabase = supabase; },

  /** PC 조회 by pc_number (e.g. 'PC01') */
  async getByNumber(pcNumber) {
    const { data, error } = await _db()
      .from('pcs')
      .select('*')
      .eq('pc_number', pcNumber)
      .maybeSingle();
    if (error) { log.error('pc_get_failed', { pcNumber, error: error.message }); return null; }
    return data;
  },

  /** PC 조회 by UUID */
  async getById(id) {
    const { data, error } = await _db()
      .from('pcs')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) { log.error('pc_get_failed', { id, error: error.message }); return null; }
    return data;
  },

  /** PC 등록 또는 기존 반환 → UUID */
  async getOrCreate(pcNumber) {
    const existing = await this.getByNumber(pcNumber);
    if (existing) {
      log.info('pc_found', { pcId: existing.id, pcNumber });
      return existing;
    }

    const { data, error } = await _db()
      .from('pcs')
      .insert({ pc_number: pcNumber, status: 'online' })
      .select('*')
      .single();

    if (error) {
      log.error('pc_create_failed', { pcNumber, error: error.message });
      throw new Error(`Failed to create PC: ${error.message}`);
    }

    log.info('pc_created', { pcId: data.id, pcNumber });
    return data;
  },

  /** PC 상태 업데이트 */
  async updateStatus(pcId, status) {
    const { error } = await _db()
      .from('pcs')
      .update({ status, last_heartbeat: new Date().toISOString() })
      .eq('id', pcId);
    if (error) {
      log.error('pc_status_update_failed', { pcId, status, error: error.message });
      return false;
    }
    return true;
  },

  /** 전체 PC 목록 */
  async listAll() {
    const { data, error } = await _db()
      .from('pcs')
      .select('*')
      .order('pc_number');
    if (error) { log.error('pc_list_failed', { error: error.message }); return []; }
    return data || [];
  },
};

// ══════════════════════════════════════════════════
// DEVICES table
// ══════════════════════════════════════════════════

const deviceModels = {
  init(supabase) { _supabase = supabase; },

  /** 디바이스 조회 by UUID */
  async getById(id) {
    const { data, error } = await _db()
      .from('devices')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) { log.error('device_get_failed', { id, error: error.message }); return null; }
    return data;
  },

  /** 디바이스 조회 by serial_number */
  async getBySerial(serial) {
    const { data, error } = await _db()
      .from('devices')
      .select('*')
      .eq('serial_number', serial)
      .maybeSingle();
    if (error) { log.error('device_get_failed', { serial, error: error.message }); return null; }
    return data;
  },

  /** PC별 디바이스 목록 */
  async listByPc(pcId, statusFilter) {
    let query = _db().from('devices').select('*').eq('pc_id', pcId);
    if (statusFilter) {
      query = Array.isArray(statusFilter)
        ? query.in('status', statusFilter)
        : query.eq('status', statusFilter);
    }
    const { data, error } = await query.order('serial_number');
    if (error) { log.error('device_list_failed', { pcId, error: error.message }); return []; }
    return data || [];
  },

  /** 디바이스 upsert (serial_number 기준) */
  async upsert(serial, pcId, fields = {}) {
    const row = {
      serial_number: serial,
      pc_id: pcId,
      status: fields.status || 'online',
      model: fields.model || null,
      battery_level: fields.battery ?? null,
      last_seen_at: new Date().toISOString(),
      ...fields,
    };
    // serial_number, pc_id는 항상 포함
    row.serial_number = serial;
    row.pc_id = pcId;

    const { data, error } = await _db()
      .from('devices')
      .upsert(row, { onConflict: 'serial_number' })
      .select('id')
      .maybeSingle();

    if (error) {
      log.error('device_upsert_failed', { serial, error: error.message });
      return null;
    }
    return data?.id || null;
  },

  /** 벌크 upsert (한번에 여러 디바이스) */
  async bulkUpsert(devices, pcId) {
    if (!devices || devices.length === 0) return { success: 0, failed: 0 };

    const rows = devices.map(d => ({
      serial_number: d.serial || d.serial_number,
      pc_id: pcId,
      status: d.status || 'online',
      model: d.model || null,
      battery_level: d.battery ?? d.battery_level ?? null,
      last_seen_at: new Date().toISOString(),
    }));

    const { error } = await _db()
      .from('devices')
      .upsert(rows, { onConflict: 'serial_number' });

    if (error) {
      log.error('device_bulk_upsert_failed', { count: rows.length, error: error.message });
      return { success: 0, failed: rows.length };
    }

    log.info('device_bulk_upsert', { count: rows.length, pcId });
    return { success: rows.length, failed: 0 };
  },

  /** 디바이스 상태 업데이트 */
  async updateStatus(deviceId, status) {
    const { error } = await _db()
      .from('devices')
      .update({ status, last_seen_at: new Date().toISOString() })
      .eq('id', deviceId);
    if (error) {
      log.error('device_status_failed', { deviceId, status, error: error.message });
      return false;
    }
    return true;
  },

  /** 벌크 상태 업데이트 (ID 리스트) */
  async bulkUpdateStatus(deviceIds, status) {
    if (!deviceIds || deviceIds.length === 0) return true;
    const { error } = await _db()
      .from('devices')
      .update({ status, last_seen_at: new Date().toISOString() })
      .in('id', deviceIds);
    if (error) {
      log.error('device_bulk_status_failed', { count: deviceIds.length, status, error: error.message });
      return false;
    }
    return true;
  },

  /** 현재 리스트에 없는 디바이스를 offline으로 마킹 */
  async markMissingOffline(pcId, activeSerials) {
    if (!activeSerials || activeSerials.length === 0) {
      const { error } = await _db()
        .from('devices')
        .update({ status: 'offline', last_seen_at: new Date().toISOString() })
        .eq('pc_id', pcId);
      if (error) log.error('device_mark_offline_failed', { pcId, error: error.message });
      return;
    }

    const { error } = await _db()
      .from('devices')
      .update({ status: 'offline', last_seen_at: new Date().toISOString() })
      .eq('pc_id', pcId)
      .not('serial_number', 'in', `(${activeSerials.join(',')})`);

    if (error) log.error('device_mark_offline_failed', { pcId, error: error.message });
  },

  /** PC별 디바이스 카운트 */
  async countByPc(pcId) {
    const counts = { total: 0, online: 0, busy: 0, error: 0, offline: 0 };
    const statuses = ['online', 'busy', 'error', 'offline'];

    const { count: total } = await _db()
      .from('devices').select('*', { count: 'exact', head: true }).eq('pc_id', pcId);
    counts.total = total || 0;

    for (const s of statuses) {
      const { count } = await _db()
        .from('devices').select('*', { count: 'exact', head: true }).eq('pc_id', pcId).eq('status', s);
      counts[s] = count || 0;
    }

    return counts;
  },
};

module.exports = { pcModels, deviceModels };
