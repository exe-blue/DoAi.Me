/**
 * agent/adb/client.js — ADB Device 래퍼 (Xiaowei WebSocket 경유)
 *
 * 모든 ADB 명령은 Xiaowei WebSocket → ADB shell로 실행됨.
 * child_process 직접 호출 금지 (프로젝트 규칙).
 *
 * 사용법:
 *   const { ADBDevice } = require('./adb');
 *   const dev = new ADBDevice(xiaowei, 'abc123serial');
 *   const model = await dev.getModel();
 *   await dev.shell('input tap 540 350');
 */
const { getLogger } = require('../common/logger');
const { ADBError, ADBTimeoutError, ADBConnectionError } = require('../common/errors');

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Xiaowei 응답에서 디바이스 출력 텍스트 추출 */
function extractOutput(res, serial) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
    if (serial && res.data[serial] !== undefined) return String(res.data[serial]);
    const vals = Object.values(res.data);
    if (vals.length > 0 && typeof vals[0] === 'string') return vals[0];
  }
  if (res.data != null) return Array.isArray(res.data) ? String(res.data[0] ?? '') : String(res.data);
  if (res.msg != null) return String(res.msg);
  return '';
}

class ADBDevice {
  /**
   * @param {import('../xiaowei-client')} xiaowei - Xiaowei WebSocket 클라이언트
   * @param {string} serial - 디바이스 시리얼 넘버
   * @param {object} [options]
   * @param {number} [options.timeout=30000] - 기본 명령 타임아웃 (ms)
   */
  constructor(xiaowei, serial, options = {}) {
    this.xiaowei = xiaowei;
    this.serial = serial;
    this.timeout = options.timeout || 30000;
    this.log = getLogger(`adb.${serial.substring(0, 8)}`);
  }

  // ═══════════════════════════════════════════════════════
  // 연결 상태
  // ═══════════════════════════════════════════════════════

  get isConnected() {
    return this.xiaowei && this.xiaowei.connected;
  }

  _ensureConnected() {
    if (!this.isConnected) {
      throw new ADBConnectionError(this.serial, { serial: this.serial });
    }
  }

  // ═══════════════════════════════════════════════════════
  // 기본 명령
  // ═══════════════════════════════════════════════════════

  /**
   * ADB shell 명령 실행
   * @param {string} command - shell 명령어
   * @param {number} [timeout] - 타임아웃 (ms)
   * @returns {Promise<string>} 출력 텍스트
   * @throws {ADBError|ADBTimeoutError}
   */
  async shell(command, timeout) {
    this._ensureConnected();
    try {
      const res = await this.xiaowei.adbShell(this.serial, command);
      return extractOutput(res, this.serial);
    } catch (err) {
      if (err.message && err.message.includes('timed out')) {
        throw new ADBTimeoutError(command, { serial: this.serial });
      }
      throw new ADBError(`shell failed: ${err.message}`, { serial: this.serial });
    }
  }

  /**
   * ADB 명령 실행 (full adb prefix)
   * @param {string} command
   * @returns {Promise<string>}
   */
  async adb(command) {
    this._ensureConnected();
    try {
      const res = await this.xiaowei.adb(this.serial, command);
      return extractOutput(res, this.serial);
    } catch (err) {
      throw new ADBError(`adb failed: ${err.message}`, { serial: this.serial });
    }
  }

  /** 파일 push (PC → 디바이스) */
  async pushFile(localPath, remotePath) {
    const out = await this.adb(`push "${localPath}" "${remotePath}"`);
    this.log.info('file_pushed', { local: localPath, remote: remotePath });
    return out;
  }

  /** APK 설치 */
  async installApk(apkPath) {
    this._ensureConnected();
    try {
      await this.xiaowei.installApk(this.serial, apkPath);
      this.log.info('apk_installed', { path: apkPath });
      return true;
    } catch (err) {
      throw new ADBError(`install failed: ${err.message}`, { serial: this.serial });
    }
  }

  // ═══════════════════════════════════════════════════════
  // 기기 정보
  // ═══════════════════════════════════════════════════════

  /** 기기 모델명 */
  async getModel() {
    return (await this.shell('getprop ro.product.model')).trim();
  }

  /** Android 버전 */
  async getAndroidVersion() {
    return (await this.shell('getprop ro.build.version.release')).trim();
  }

  /** 배터리 레벨 (0~100) */
  async getBatteryLevel() {
    const out = await this.shell('dumpsys battery | grep level');
    const m = out.match(/level:\s*(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
  }

  /** 배터리 충전 중 여부 */
  async isBatteryCharging() {
    const out = await this.shell('dumpsys battery | grep status');
    return out.includes('2') || out.includes('5'); // CHARGING or FULL
  }

  /** 화면 크기 → { width, height } */
  async getScreenSize() {
    const out = await this.shell('wm size');
    const m = out.match(/(\d+)x(\d+)/);
    if (m) return { width: parseInt(m[1], 10), height: parseInt(m[2], 10) };
    return { width: 1080, height: 1920 };
  }

  /** IP 주소 (WiFi) */
  async getIpAddress() {
    const out = await this.shell('ip addr show wlan0 | grep "inet "');
    const m = out.match(/inet\s+(\d+\.\d+\.\d+\.\d+)/);
    return m ? m[1] : '';
  }

  /** 종합 기기 정보 */
  async getDeviceInfo() {
    const [model, androidVersion, battery, charging, screen, ip] = await Promise.all([
      this.getModel().catch(() => ''),
      this.getAndroidVersion().catch(() => ''),
      this.getBatteryLevel().catch(() => -1),
      this.isBatteryCharging().catch(() => false),
      this.getScreenSize().catch(() => ({ width: 1080, height: 1920 })),
      this.getIpAddress().catch(() => ''),
    ]);
    return { serial: this.serial, model, androidVersion, battery, charging, screen, ip };
  }

  // ═══════════════════════════════════════════════════════
  // 화면 제어
  // ═══════════════════════════════════════════════════════

  /** 화면 깨우기 */
  async wakeUp() {
    await this.shell('input keyevent KEYCODE_WAKEUP');
  }

  /** 홈 버튼 */
  async goHome() {
    this._ensureConnected();
    await this.xiaowei.goHome(this.serial);
  }

  /** 뒤로 가기 */
  async goBack() {
    this._ensureConnected();
    await this.xiaowei.goBack(this.serial);
  }

  /** 세로 모드 강제 */
  async forcePortrait() {
    await this.shell('settings put system accelerometer_rotation 0');
    await this.shell('settings put system user_rotation 0');
    await this.shell('content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0');
    await this.shell('content insert --uri content://settings/system --bind name:s:user_rotation --bind value:i:0');
  }

  /** 스크린샷 촬영 */
  async screenshot(savePath) {
    this._ensureConnected();
    return this.xiaowei.screen(this.serial, savePath);
  }

  // ═══════════════════════════════════════════════════════
  // 입력
  // ═══════════════════════════════════════════════════════

  /** 탭 (ADB input tap) */
  async tap(x, y) {
    await this.shell(`input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  /** 스와이프 */
  async swipe(x1, y1, x2, y2, durationMs = 300) {
    await this.shell(`input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`);
  }

  /** 키 이벤트 */
  async keyEvent(keycode) {
    await this.shell(`input keyevent ${keycode}`);
  }

  /**
   * 텍스트 입력 (한글 지원: ADBKeyboard → 클립보드 → ASCII 폴백)
   * @returns {string} 사용된 방법 ('adb_keyboard'|'clipboard'|'ascii'|null)
   */
  async inputText(text) {
    if (!text) return null;

    // 방법 1: ADBKeyboard broadcast (한글 지원)
    const b64 = Buffer.from(text, 'utf-8').toString('base64');
    try {
      const out = await this.shell(`am broadcast -a ADB_INPUT_B64 --es msg '${b64}' 2>/dev/null`);
      if (out.includes('result=0')) return 'adb_keyboard';
    } catch {}

    // 방법 2: 클립보드 붙여넣기
    try {
      const safe = text.replace(/'/g, '').replace(/"/g, '');
      await this.shell(`am broadcast -a clipper.set -e text '${safe}' 2>/dev/null`);
      await _sleep(300);
      await this.keyEvent(279); // KEYCODE_PASTE
      return 'clipboard';
    } catch {}

    // 방법 3: ASCII만 (한글 불가)
    if (/^[\x20-\x7e]+$/.test(text)) {
      const forInput = text.replace(/ /g, '%s').replace(/'/g, '');
      await this.shell(`input text '${forInput}'`);
      return 'ascii';
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════
  // 앱 관리
  // ═══════════════════════════════════════════════════════

  /** 앱 시작 */
  async startApp(packageName) {
    this._ensureConnected();
    await this.xiaowei.startApk(this.serial, packageName);
  }

  /** 앱 종료 */
  async stopApp(packageName) {
    this._ensureConnected();
    await this.xiaowei.stopApk(this.serial, packageName);
  }

  /** YouTube 열기 */
  async openYouTube() {
    await this.shell('monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1');
  }

  /** YouTube 종료 */
  async closeYouTube() {
    await this.shell('am force-stop com.google.android.youtube');
  }

  /** YouTube 캐시 클리어 */
  async clearYouTubeCache() {
    await this.shell('pm clear com.google.android.youtube');
    this.log.info('youtube_cache_cleared');
  }

  /** YouTube 버전 */
  async getYouTubeVersion() {
    const out = await this.shell('dumpsys package com.google.android.youtube | grep versionName');
    const m = out.match(/versionName=(\S+)/);
    return m ? m[1] : '';
  }

  // ═══════════════════════════════════════════════════════
  // 프록시
  // ═══════════════════════════════════════════════════════

  /** 글로벌 HTTP 프록시 설정 */
  async setProxy(host, port) {
    await this.shell(`settings put global http_proxy ${host}:${port}`);
    this.log.info('proxy_set', { proxy: `${host}:${port}` });
    return true;
  }

  /** 프록시 제거 */
  async removeProxy() {
    await this.shell('settings put global http_proxy :0');
    this.log.info('proxy_removed');
    return true;
  }

  // ═══════════════════════════════════════════════════════
  // 최적화
  // ═══════════════════════════════════════════════════════

  /** 기기 최적화 (캐시 정리, 불필요 앱 종료 등) */
  async optimize() {
    const results = {};

    // 백그라운드 앱 정리
    try {
      await this.shell('am kill-all');
      results.killedBgApps = true;
    } catch { results.killedBgApps = false; }

    // 캐시 trimming
    try {
      await this.shell('pm trim-caches 500M');
      results.trimmedCache = true;
    } catch { results.trimmedCache = false; }

    // 저장 공간 확인
    try {
      const out = await this.shell('df /data | tail -1');
      const m = out.match(/(\d+)%/);
      results.storageUsedPct = m ? parseInt(m[1], 10) : -1;
    } catch { results.storageUsedPct = -1; }

    this.log.info('device_optimized', results);
    return results;
  }
}

module.exports = { ADBDevice, extractOutput };
