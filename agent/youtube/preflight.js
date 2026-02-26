/**
 * agent/youtube/preflight.js — YouTube 셀렉터 사전 검증
 *
 * Agent 시작 시 핵심 셀렉터 존재 여부를 빠르게 체크.
 * YouTube 앱 업데이트로 resource-id가 변경되면 즉시 감지.
 *
 * 사용법:
 *   const { preflightCheck } = require('./youtube/preflight');
 *   const result = await preflightCheck(dev);
 *   if (!result.passed) { // 미션 중지 }
 */
const { getLogger } = require('../common/logger');
const { dumpUI } = require('../adb/screen');
const { RES } = require('./selectors');

const log = getLogger('youtube.preflight');

/** 검증할 핵심 셀렉터 (이것들이 없으면 자동화 불가) */
const CRITICAL_SELECTORS = [
  { name: 'player_view', id: RES.PLAYER_VIEW, screen: 'video' },
  { name: 'like_button', id: RES.LIKE, screen: 'video' },
  { name: 'subscribe_button', id: RES.SUBSCRIBE, screen: 'video' },
  { name: 'search_edit', id: RES.SEARCH_EDIT, screen: 'search' },
  { name: 'skip_ad_button', id: RES.SKIP_AD, screen: 'ad', optional: true },
];

/**
 * YouTube 셀렉터 사전 검증
 *
 * 1. YouTube 앱 열기
 * 2. 홈 화면 dump → search 관련 셀렉터 확인
 * 3. 아무 영상 탭 → 재생 화면 dump → player/like/subscribe 확인
 * 4. 결과 반환
 *
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<{passed: boolean, results: object[], missing: string[], youtubeVersion: string}>}
 */
async function preflightCheck(dev) {
  log.info('preflight_start', { serial: dev.serial });

  const results = [];
  const missing = [];
  let youtubeVersion = '';

  try {
    // YouTube 버전 확인
    youtubeVersion = await dev.getYouTubeVersion();
    log.info('youtube_version', { serial: dev.serial, version: youtubeVersion });

    // YouTube 열기
    await dev.openYouTube();
    await new Promise(r => setTimeout(r, 4000));

    // 홈 화면 dump
    const homeUI = await dumpUI(dev);
    for (const sel of CRITICAL_SELECTORS) {
      if (sel.screen !== 'search' && sel.screen !== 'home') continue;
      const found = homeUI.contains(sel.id);
      results.push({ name: sel.name, id: sel.id, found, screen: 'home' });
      if (!found && !sel.optional) missing.push(sel.name);
    }

    // 검색 결과 열어서 영상 화면 진입
    await dev.shell("am start -a android.intent.action.VIEW -d 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'");
    await new Promise(r => setTimeout(r, 6000));

    // 영상 화면 dump
    const videoUI = await dumpUI(dev);
    for (const sel of CRITICAL_SELECTORS) {
      if (sel.screen !== 'video') continue;
      const found = videoUI.contains(sel.id);
      results.push({ name: sel.name, id: sel.id, found, screen: 'video' });
      if (!found && !sel.optional) missing.push(sel.name);
    }

    // 홈으로 복귀
    await dev.goHome();

  } catch (err) {
    log.error('preflight_error', { serial: dev.serial, error: err.message });
    return { passed: false, results, missing: ['preflight_crashed'], youtubeVersion };
  }

  const passed = missing.length === 0;

  if (passed) {
    log.info('preflight_passed', {
      serial: dev.serial,
      version: youtubeVersion,
      checked: results.length,
    });
  } else {
    log.error('preflight_failed', {
      serial: dev.serial,
      version: youtubeVersion,
      missing,
      message: 'YouTube UI changed — selectors.js update required',
    });
  }

  return { passed, results, missing, youtubeVersion };
}

/**
 * 간단 검증 (YouTube 열지 않고 현재 화면에서만 체크)
 * Agent 시작 시 빠르게 확인용.
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<boolean>}
 */
async function quickSelectorCheck(dev) {
  try {
    const version = await dev.getYouTubeVersion();
    if (!version) {
      log.warn('youtube_not_installed', { serial: dev.serial });
      return false;
    }
    log.info('quick_check_ok', { serial: dev.serial, version });
    return true;
  } catch {
    return false;
  }
}

module.exports = { preflightCheck, quickSelectorCheck, CRITICAL_SELECTORS };
