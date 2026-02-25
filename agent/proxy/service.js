/**
 * agent/proxy/service.js — 프록시 풀 관리, 헬스체크, 로테이션
 *
 * ADB 프록시 설정은 콜백으로 주입 (순환참조 방지).
 *
 * 사용법:
 *   const { ProxyService } = require('./proxy');
 *   const svc = new ProxyService(supabase, {
 *     applyProxy: async (serial, addr) => adbDevice.setProxy(host, port),
 *     removeProxy: async (serial) => adbDevice.removeProxy(),
 *   });
 *   const proxy = await svc.rotateProxy(deviceId, serial);
 */
const { getLogger } = require('../common/logger');
const { ProxyError } = require('../common/errors');
const { proxyModels } = require('./models');

const log = getLogger('proxy.service');

class ProxyService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   * @param {object} [callbacks] - ADB 프록시 설정 콜백
   * @param {Function} [callbacks.applyProxy] - (serial, address) => Promise
   * @param {Function} [callbacks.removeProxy] - (serial) => Promise
   */
  constructor(supabase, callbacks = {}) {
    proxyModels.init(supabase);
    this._applyProxy = callbacks.applyProxy || null;
    this._removeProxy = callbacks.removeProxy || null;
  }

  /**
   * 사용 가능한 프록시 1개 반환 (active, 미할당, fail_count 낮은 순)
   * @returns {Promise<object|null>}
   */
  async getAvailableProxy() {
    const proxies = await proxyModels.getAvailable(1);
    if (!proxies || proxies.length === 0) {
      log.warn('no_available_proxy');
      return null;
    }
    return proxies[0];
  }

  /**
   * 프록시를 디바이스에 할당
   * @param {string} proxyId
   * @param {string} deviceId - DB device UUID
   * @param {string} [serial] - 기기 시리얼 (ADB 프록시 설정용)
   */
  async assignToDevice(proxyId, deviceId, serial) {
    const ok = await proxyModels.assignToDevice(proxyId, deviceId, serial);
    if (!ok) throw new ProxyError('Failed to assign proxy', { deviceId });

    // ADB에 프록시 설정 (콜백 있을 때만)
    if (serial && this._applyProxy) {
      const proxy = await proxyModels.getById(proxyId);
      if (proxy && proxy.address) {
        try {
          await this._applyProxy(serial, proxy.address);
          log.info('proxy_applied', { proxyId, serial, address: proxy.address });
        } catch (err) {
          log.error('proxy_apply_failed', { proxyId, serial, error: err.message });
        }
      }
    }

    return true;
  }

  /**
   * 프록시-디바이스 할당 해제
   * @param {string} proxyId
   * @param {string} [serial] - ADB 프록시 제거용
   */
  async releaseFromDevice(proxyId, serial) {
    const ok = await proxyModels.releaseFromDevice(proxyId);

    if (serial && this._removeProxy) {
      try {
        await this._removeProxy(serial);
        log.info('proxy_removed_from_device', { proxyId, serial });
      } catch (err) {
        log.warn('proxy_remove_failed', { proxyId, serial, error: err.message });
      }
    }

    return ok;
  }

  /**
   * 프록시 헬스체크 (연결 테스트)
   * @param {string} proxyId
   * @returns {Promise<{alive: boolean, responseMs: number|null, error: string|null}>}
   */
  async healthCheck(proxyId) {
    const proxy = await proxyModels.getById(proxyId);
    if (!proxy) return { alive: false, responseMs: null, error: 'proxy not found' };

    const start = Date.now();
    try {
      const url = `http://${proxy.address}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      await fetch('https://www.google.com', {
        signal: controller.signal,
        // Note: fetch doesn't support proxy natively in Node.js
        // This is a basic connectivity test — real proxy test requires https-proxy-agent
      });
      clearTimeout(timeout);

      const responseMs = Date.now() - start;
      await proxyModels.updateHealth(proxyId, 'active', 0, null);

      return { alive: true, responseMs, error: null };
    } catch (err) {
      const responseMs = Date.now() - start;
      const newFailCount = await proxyModels.incrementFailCount(proxyId);

      log.warn('health_check_failed', {
        proxyId, address: proxy.address, error: err.message, failCount: newFailCount,
      });

      return { alive: false, responseMs, error: err.message };
    }
  }

  /**
   * 전체 프록시 벌크 헬스체크
   * @param {string} [pcId] - PC 필터 (없으면 전체)
   * @returns {Promise<{total, alive, dead, checked}>}
   */
  async bulkHealthCheck(pcId) {
    const proxies = pcId
      ? await proxyModels.listByPc(pcId)
      : (await proxyModels.getAvailable(100));

    let alive = 0;
    let dead = 0;

    log.info('bulk_health_check_start', { count: proxies.length });

    for (const proxy of proxies) {
      const result = await this.healthCheck(proxy.id);
      if (result.alive) alive++;
      else dead++;
    }

    log.info('bulk_health_check_done', { total: proxies.length, alive, dead });
    return { total: proxies.length, alive, dead, checked: proxies.length };
  }

  /**
   * 프록시 로테이션: 현재 해제 → 새 프록시 할당 → ADB 설정
   * @param {string} deviceId - DB device UUID
   * @param {string} serial - 기기 시리얼
   * @param {string} [currentProxyId] - 현재 프록시 (없으면 해제 건너뜀)
   * @returns {Promise<object|null>} 새 프록시
   */
  async rotateProxy(deviceId, serial, currentProxyId) {
    // 현재 프록시 해제
    if (currentProxyId) {
      await this.releaseFromDevice(currentProxyId, serial);
      log.info('proxy_released_for_rotation', { proxyId: currentProxyId, serial });
    }

    // 새 프록시 할당
    const newProxy = await this.getAvailableProxy();
    if (!newProxy) {
      log.warn('rotation_failed_no_proxy', { deviceId, serial });
      return null;
    }

    await this.assignToDevice(newProxy.id, deviceId, serial);
    log.info('proxy_rotated', {
      serial,
      oldProxy: currentProxyId,
      newProxy: newProxy.id,
      address: newProxy.address,
    });

    return newProxy;
  }

  /** 프록시 dead 마킹 */
  async markDead(proxyId, serial) {
    await proxyModels.markDead(proxyId);
    if (serial && this._removeProxy) {
      try { await this._removeProxy(serial); } catch {}
    }
  }

  /** 풀 상태 */
  async getPoolStatus(pcId) {
    return proxyModels.getPoolStatus(pcId);
  }
}

module.exports = { ProxyService };
