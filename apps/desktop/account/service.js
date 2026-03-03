/**
 * agent/account/service.js — 계정 풀 관리 비즈니스 로직
 *
 * 사용법:
 *   const { AccountService } = require('./account');
 *   const svc = new AccountService(supabase);
 *   const acct = await svc.getAvailableAccount();
 *   await svc.assignToDevice(acct.id, deviceId);
 */
const { getLogger } = require('../common/logger');
const { AccountError, AccountBannedError } = require('../common/errors');
const { accountModels } = require('./models');

const log = getLogger('account.service');

class AccountService {
  /**
   * @param {import('@supabase/supabase-js').SupabaseClient} supabase
   */
  constructor(supabase) {
    accountModels.init(supabase);
  }

  /**
   * 사용 가능한 계정 1개 반환 (밴 아님, 쿨다운 지남, 미할당)
   * @returns {Promise<object|null>}
   * @throws {AccountError} 사용 가능한 계정 없음
   */
  async getAvailableAccount() {
    // 먼저 만료된 쿨다운 복구
    await accountModels.recoverExpiredCooldowns();

    const accounts = await accountModels.getAvailable(1);
    if (!accounts || accounts.length === 0) {
      log.warn('no_available_account');
      return null;
    }
    return accounts[0];
  }

  /**
   * 계정을 디바이스에 할당
   * @param {string} accountId
   * @param {string} deviceId
   * @returns {Promise<boolean>}
   */
  async assignToDevice(accountId, deviceId) {
    const ok = await accountModels.assignToDevice(accountId, deviceId);
    if (!ok) throw new AccountError('Failed to assign account', { deviceId });
    return true;
  }

  /**
   * 계정-디바이스 할당 해제
   * @param {string} accountId
   */
  async releaseFromDevice(accountId) {
    return accountModels.releaseFromDevice(accountId);
  }

  /**
   * 계정 밴 처리 (디바이스에서 해제 + 상태 변경)
   * @param {string} accountId
   * @param {string} reason - 밴 사유
   */
  async markBanned(accountId, reason) {
    const ok = await accountModels.markBanned(accountId, reason);
    if (ok) {
      log.error('account_banned', { accountId, reason });
    }
    return ok;
  }

  /**
   * 쿨다운 설정 (과도한 활동 후)
   * @param {string} accountId
   * @param {number} minutes - 쿨다운 시간 (분)
   */
  async setCooldown(accountId, minutes = 60) {
    return accountModels.setCooldown(accountId, minutes);
  }

  /**
   * 계정 로테이션: 현재 계정 해제 → 새 계정 할당
   * @param {string} deviceId
   * @param {string} [currentAccountId] - 현재 계정 (없으면 해제 건너뜀)
   * @returns {Promise<object|null>} 새로 할당된 계정
   */
  async rotateAccount(deviceId, currentAccountId) {
    // 현재 계정 해제
    if (currentAccountId) {
      await this.releaseFromDevice(currentAccountId);
      log.info('account_released_for_rotation', { accountId: currentAccountId, deviceId });
    }

    // 새 계정 할당
    const newAccount = await this.getAvailableAccount();
    if (!newAccount) {
      log.warn('rotation_failed_no_account', { deviceId });
      return null;
    }

    await this.assignToDevice(newAccount.id, deviceId);
    log.info('account_rotated', {
      deviceId,
      oldAccount: currentAccountId,
      newAccount: newAccount.id,
      email: newAccount.email,
    });

    return newAccount;
  }

  /**
   * 전체 계정 풀 상태
   * @returns {Promise<{total, available, in_use, banned, cooldown}>}
   */
  async getPoolStatus() {
    return accountModels.getPoolStatus();
  }

  /**
   * 태스크 완료 후 계정 사용 기록
   * @param {string} accountId
   */
  async recordTaskUsage(accountId) {
    await accountModels.incrementTaskCount(accountId);
  }
}

module.exports = { AccountService };
