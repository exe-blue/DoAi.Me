/**
 * agent/common/errors.js — 프로젝트 전용 에러 클래스 계층
 *
 * 모든 에러에 context (deviceId, pcId, serial) 자동 포함.
 *
 * 사용법:
 *   const { ADBError, YouTubeError } = require('./common/errors');
 *   throw new ADBError('connection timeout', { deviceId: 'PC01-001', serial: 'abc' });
 */

class AgentFarmError extends Error {
  /**
   * @param {string} message
   * @param {object} [context] - { deviceId, pcId, serial, ... }
   */
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.deviceId = context.deviceId || context.device_id || null;
    this.pcId = context.pcId || context.pc_id || null;
    this.serial = context.serial || null;
    this.timestamp = new Date().toISOString();
  }

  toString() {
    const ctx = [];
    if (this.pcId) ctx.push(`pc=${this.pcId}`);
    if (this.deviceId) ctx.push(`device=${this.deviceId}`);
    if (this.serial) ctx.push(`serial=${this.serial}`);
    const ctxStr = ctx.length > 0 ? ` (${ctx.join(', ')})` : '';
    return `${this.name}: ${this.message}${ctxStr}`;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      deviceId: this.deviceId,
      pcId: this.pcId,
      serial: this.serial,
      timestamp: this.timestamp,
      stack: this.stack,
    };
  }
}

// ── 기기/ADB ──
class DeviceError extends AgentFarmError {}
class ADBError extends DeviceError {}
class ADBTimeoutError extends ADBError {
  constructor(command, context = {}) {
    super(`ADB command timed out: ${command}`, context);
    this.command = command;
  }
}
class ADBConnectionError extends ADBError {
  constructor(serial, context = {}) {
    super(`ADB connection lost: ${serial}`, { serial, ...context });
  }
}

// ── 계정 ──
class AccountError extends AgentFarmError {}
class AccountBannedError extends AccountError {
  constructor(accountId, reason, context = {}) {
    super(`Account banned: ${accountId} (${reason})`, context);
    this.accountId = accountId;
    this.reason = reason;
  }
}
class AccountCooldownError extends AccountError {
  constructor(accountId, cooldownUntil, context = {}) {
    super(`Account in cooldown: ${accountId} until ${cooldownUntil}`, context);
    this.accountId = accountId;
    this.cooldownUntil = cooldownUntil;
  }
}

// ── 프록시 ──
class ProxyError extends AgentFarmError {}
class ProxyConnectionError extends ProxyError {
  constructor(proxyAddr, context = {}) {
    super(`Proxy connection failed: ${proxyAddr}`, context);
    this.proxyAddr = proxyAddr;
  }
}

// ── YouTube ──
class YouTubeError extends AgentFarmError {}
class YouTubeDetectionError extends YouTubeError {
  constructor(detectionType, context = {}) {
    super(`Bot detection triggered: ${detectionType}`, context);
    this.detectionType = detectionType;
  }
}
class YouTubeAdError extends YouTubeError {
  constructor(message, context = {}) {
    super(message || 'Ad skip failed', context);
  }
}
class YouTubeSearchError extends YouTubeError {
  constructor(query, context = {}) {
    super(`Search failed for: "${query}"`, context);
    this.query = query;
  }
}
class YouTubePlaybackError extends YouTubeError {
  constructor(videoId, context = {}) {
    super(`Playback failed: ${videoId}`, context);
    this.videoId = videoId;
  }
}

// ── Xiaowei ──
class XiaoweiError extends AgentFarmError {}
class XiaoweiTimeoutError extends XiaoweiError {
  constructor(action, context = {}) {
    super(`Xiaowei request timed out: ${action}`, context);
    this.action = action;
  }
}

// ── Config ──
class ConfigValidationError extends AgentFarmError {
  constructor(errors) {
    super(`Config validation failed:\n  ${errors.join('\n  ')}`);
    this.validationErrors = errors;
  }
}

module.exports = {
  AgentFarmError,
  DeviceError,
  ADBError,
  ADBTimeoutError,
  ADBConnectionError,
  AccountError,
  AccountBannedError,
  AccountCooldownError,
  ProxyError,
  ProxyConnectionError,
  YouTubeError,
  YouTubeDetectionError,
  YouTubeAdError,
  YouTubeSearchError,
  YouTubePlaybackError,
  XiaoweiError,
  XiaoweiTimeoutError,
  ConfigValidationError,
};
