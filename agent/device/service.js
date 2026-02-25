/**
 * agent/device/service.js — PC 등록, 기기 등록/검증/최적화 서비스
 *
 * 사용법:
 *   const { DeviceService } = require('./device');
 *   const svc = new DeviceService(xiaowei, supabase, config);
 *   const pc = await svc.registerPC('PC01');
 *   const devices = await svc.discoverAndRegister();
 *   await svc.optimizeAll();
 *
 * 단독 실행:
 *   node agent/device/service.js
 */
const { getLogger } = require('../common/logger');
const { pcModels, deviceModels } = require('./models');
const { ADBDevice } = require('../adb/client');
const { dumpUI, getForegroundApp } = require('../adb/screen');
const { sleep } = require('../adb/helpers');

const log = getLogger('device.service');

class DeviceService {
  /**
   * @param {import('../xiaowei-client')} xiaowei
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {object} config
   */
  constructor(xiaowei, supabase, config) {
    this.xiaowei = xiaowei;
    this.supabase = supabase;
    this.config = config;
    this.pcId = null;
    this.pcNumber = config.pcNumber || 'PC00';
  }

  // ═══════════════════════════════════════════════════════
  // PC 등록
  // ═══════════════════════════════════════════════════════

  /**
   * PC 등록 + 환경 검증
   * @param {string} [pcNumber] - 기본값: config.pcNumber
   * @returns {Promise<{pc: object, checks: object}>}
   */
  async registerPC(pcNumber) {
    const pn = pcNumber || this.pcNumber;
    log.info('pc_register_start', { pcNumber: pn });

    // 1. Supabase에 PC 등록
    pcModels.init(this.supabase);
    deviceModels.init(this.supabase);
    const pc = await pcModels.getOrCreate(pn);
    this.pcId = pc.id;

    // 2. 환경 검증
    const checks = await this._verifyEnvironment();

    // 3. PC 상태 업데이트
    const allOk = Object.values(checks).every(v => v === true);
    await pcModels.updateStatus(pc.id, allOk ? 'online' : 'error');

    log.info('pc_registered', { pcId: pc.id, pcNumber: pn, checks });
    return { pc, checks };
  }

  /**
   * 환경 검증 (Supabase, Xiaowei, config)
   * @private
   */
  async _verifyEnvironment() {
    const checks = {
      supabase: false,
      xiaowei: false,
      configValid: false,
    };

    // Supabase 연결
    try {
      const { error } = await this.supabase.from('pcs').select('id').limit(1);
      checks.supabase = !error;
    } catch { checks.supabase = false; }

    // Xiaowei 연결
    checks.xiaowei = !!(this.xiaowei && this.xiaowei.connected);

    // Config 검증
    try {
      if (this.config.validate) {
        this.config.validate();
        checks.configValid = true;
      } else {
        checks.configValid = !!(this.config.supabaseUrl && this.config.pcNumber);
      }
    } catch { checks.configValid = false; }

    return checks;
  }

  // ═══════════════════════════════════════════════════════
  // 기기 탐색 & 등록
  // ═══════════════════════════════════════════════════════

  /**
   * Xiaowei에 연결된 기기 목록 조회
   * @returns {Promise<Array<{serial: string}>>}
   */
  async discoverDevices() {
    if (!this.xiaowei || !this.xiaowei.connected) {
      log.warn('discover_skip', { reason: 'xiaowei_offline' });
      return [];
    }

    try {
      const res = await this.xiaowei.list();
      if (!res) return [];

      // Xiaowei list 응답 파싱 (형식: { data: [...] } 또는 { devices: [...] })
      let devices = [];
      if (Array.isArray(res.data)) {
        devices = res.data;
      } else if (res.data && typeof res.data === 'object') {
        devices = Object.keys(res.data).map(serial => ({ serial }));
      }

      log.info('devices_discovered', { count: devices.length });
      return devices;
    } catch (err) {
      log.error('discover_failed', { error: err.message });
      return [];
    }
  }

  /**
   * 기기 탐색 → 정보 수집 → Supabase 등록 (벌크)
   * @returns {Promise<{registered: number, updated: number, errors: number, devices: Array}>}
   */
  async discoverAndRegister() {
    if (!this.pcId) throw new Error('PC not registered. Call registerPC() first.');
    log.info('register_devices_start', { pcId: this.pcId });

    const discovered = await this.discoverDevices();
    if (discovered.length === 0) {
      log.warn('no_devices_found');
      return { registered: 0, updated: 0, errors: 0, devices: [] };
    }

    // 기기 정보 수집
    const deviceRows = [];
    let errors = 0;

    for (const d of discovered) {
      const serial = d.serial || d;
      try {
        const dev = new ADBDevice(this.xiaowei, serial);
        const info = await dev.getDeviceInfo();
        deviceRows.push({
          serial: serial,
          status: 'online',
          model: info.model || null,
          battery_level: info.battery >= 0 ? info.battery : null,
        });
      } catch (err) {
        log.warn('device_info_failed', { serial, error: err.message });
        deviceRows.push({ serial, status: 'online' });
        errors++;
      }
    }

    // 벌크 upsert
    const result = await deviceModels.bulkUpsert(deviceRows, this.pcId);

    // 미발견 기기 offline 처리
    const activeSerials = deviceRows.map(d => d.serial);
    await deviceModels.markMissingOffline(this.pcId, activeSerials);

    log.info('register_devices_done', {
      discovered: discovered.length,
      registered: result.success,
      errors,
    });

    return {
      registered: result.success,
      updated: 0,
      errors,
      devices: deviceRows,
    };
  }

  /**
   * 단일 기기 등록 (수동)
   * @param {string} serial
   * @param {object} [fields] - 추가 필드
   * @returns {Promise<string|null>} device UUID
   */
  async registerDevice(serial, fields = {}) {
    if (!this.pcId) throw new Error('PC not registered');
    const dev = new ADBDevice(this.xiaowei, serial);

    let info = {};
    try {
      info = await dev.getDeviceInfo();
    } catch (err) {
      log.warn('device_info_failed', { serial, error: err.message });
    }

    const id = await deviceModels.upsert(serial, this.pcId, {
      status: 'online',
      model: info.model || fields.model || null,
      battery_level: info.battery >= 0 ? info.battery : null,
      ...fields,
    });

    log.info('device_registered', { serial, deviceId: id, model: info.model });
    return id;
  }

  // ═══════════════════════════════════════════════════════
  // 기기 최적화
  // ═══════════════════════════════════════════════════════

  /**
   * 단일 기기 최적화
   * @param {string} serial
   * @returns {Promise<object>} 최적화 결과
   */
  async optimizeDevice(serial) {
    const dev = new ADBDevice(this.xiaowei, serial);
    const results = {};

    // 1. 불필요 앱 종료 (YouTube, 시스템 앱 제외)
    try {
      await dev.shell('am kill-all');
      results.killedBgApps = true;
    } catch { results.killedBgApps = false; }

    // 2. 캐시 정리
    try {
      await dev.shell('pm trim-caches 500M');
      results.trimmedCache = true;
    } catch { results.trimmedCache = false; }

    // 3. 화면 밝기 최소화 (배터리 절약)
    try {
      await dev.shell('settings put system screen_brightness_mode 0');
      await dev.shell('settings put system screen_brightness 1');
      results.brightnessMin = true;
    } catch { results.brightnessMin = false; }

    // 4. 화면 꺼짐 시간 최대 (자동화 중 꺼지지 않도록)
    try {
      await dev.shell('settings put system screen_off_timeout 1800000'); // 30분
      results.screenTimeout = true;
    } catch { results.screenTimeout = false; }

    // 5. 세로 모드 고정
    try {
      await dev.forcePortrait();
      results.portrait = true;
    } catch { results.portrait = false; }

    // 6. 배터리 정보
    try {
      results.battery = await dev.getBatteryLevel();
    } catch { results.battery = -1; }

    log.info('device_optimized', { serial, ...results });
    return results;
  }

  /**
   * PC에 연결된 모든 기기 최적화
   * @returns {Promise<{total: number, success: number, failed: number}>}
   */
  async optimizeAll() {
    if (!this.pcId) throw new Error('PC not registered');

    const devices = await deviceModels.listByPc(this.pcId, ['online', 'busy']);
    let success = 0;
    let failed = 0;

    log.info('optimize_all_start', { count: devices.length });

    for (const d of devices) {
      const serial = d.serial_number;
      try {
        await this.optimizeDevice(serial);
        success++;
      } catch (err) {
        log.error('optimize_failed', { serial, error: err.message });
        failed++;
      }
      await sleep(200); // 디바이스 간 약간의 간격
    }

    log.info('optimize_all_done', { total: devices.length, success, failed });
    return { total: devices.length, success, failed };
  }

  // ═══════════════════════════════════════════════════════
  // 상태 조회
  // ═══════════════════════════════════════════════════════

  /** PC의 디바이스 카운트 */
  async getDeviceCounts() {
    if (!this.pcId) return null;
    return deviceModels.countByPc(this.pcId);
  }

  /** 온라인 디바이스 시리얼 목록 */
  async getOnlineSerials() {
    if (!this.pcId) return [];
    const devices = await deviceModels.listByPc(this.pcId, ['online', 'busy']);
    return devices.map(d => d.serial_number);
  }
}

module.exports = { DeviceService };
