/**
 * agent/adb/screen.js — UI dump + 화면 상태 판별
 *
 * ADBDevice를 받아서 uiautomator dump → parseUI → UITree 반환.
 * 재사용 가능한 화면 체크 유틸리티.
 */
const { parseUI } = require('./xml-parser');

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * UI dump 실행 → UITree 반환
 * @param {import('./client').ADBDevice} dev
 * @returns {Promise<import('./xml-parser').UITree>}
 */
async function dumpUI(dev) {
  await dev.shell('uiautomator dump /sdcard/ui.xml');
  await _sleep(800);
  const xml = await dev.shell('cat /sdcard/ui.xml');
  return parseUI(xml);
}

/**
 * 특정 요소가 나올 때까지 대기
 * @param {import('./client').ADBDevice} dev
 * @param {Array<object>} selectors - UITree.findFirst용 셀렉터 배열
 * @param {number} [timeoutMs=10000]
 * @param {number} [pollMs=2000]
 * @returns {Promise<import('./xml-parser').UINode|null>}
 */
async function waitForNode(dev, selectors, timeoutMs = 10000, pollMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ui = await dumpUI(dev);
    const node = ui.findFirst(selectors);
    if (node && node.hasBounds) return node;
    await _sleep(pollMs);
  }
  return null;
}

/**
 * 현재 포그라운드 앱 확인
 * @returns {Promise<string>} 패키지명
 */
async function getForegroundApp(dev) {
  const out = await dev.shell('dumpsys activity activities | grep mResumedActivity');
  const m = out.match(/u0\s+(\S+)\//);
  return m ? m[1] : '';
}

/**
 * 미디어 재생 상태 확인
 * @returns {Promise<'playing'|'paused'|'unknown'>}
 */
async function getPlaybackState(dev) {
  try {
    const out = await dev.shell('dumpsys media_session | grep "state="');
    if (out.includes('state=3')) return 'playing';
    if (out.includes('state=2')) return 'paused';
  } catch {}
  return 'unknown';
}

/**
 * 화면 켜짐 상태 확인
 * @returns {Promise<boolean>}
 */
async function isScreenOn(dev) {
  const out = await dev.shell('dumpsys power | grep "Display Power"');
  return out.includes('state=ON');
}

module.exports = { dumpUI, waitForNode, getForegroundApp, getPlaybackState, isScreenOn };
