/**
 * agent/youtube/watch.js — YouTube 영상 시청 + 광고 건너뛰기 + 인간 행동 시뮬레이션
 *
 * 시청 루프: 광고 체크(15s) + 화면 깨우기(30s) + 랜덤 인간 행동
 */
const { getLogger } = require('../common/logger');
const { dumpUI, getPlaybackState } = require('../adb/screen');
const { sleep, randInt, humanDelay, pctToAbs } = require('../adb/helpers');
const { AD_SIGNALS, AD_SKIP_KEYWORDS, COORDS, RES } = require('./selectors');

const log = getLogger('youtube.watch');

// ═══════════════════════════════════════════════════════
// 광고 건너뛰기
// ═══════════════════════════════════════════════════════

/**
 * 광고 건너뛰기 시도 (XML 1순위 → 고정 좌표 폴백)
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<boolean>} 건너뛰기 시도 여부
 */
async function trySkipAd(dev) {
  const ui = await dumpUI(dev);
  if (ui.isEmpty) return false;

  // 1순위: XML에서 건너뛰기 버튼 bounds 추출
  for (const kw of AD_SKIP_KEYWORDS) {
    if (!ui.contains(kw)) continue;
    const node = ui.findByResourceId(RES.SKIP_AD)
      || ui.findByContentDescContains('건너뛰기')
      || ui.findByContentDescContains('Skip');

    if (node && node.hasBounds) {
      log.info('ad_skip_xml', { keyword: kw, x: node.cx, y: node.cy });
      await dev.tap(node.cx, node.cy);
      return true;
    }
  }

  // 광고 신호 있지만 건너뛰기 bounds 못 찾음
  for (const sig of AD_SIGNALS) {
    if (ui.contains(sig)) {
      log.info('ad_skip_fixed', { signal: sig });
      return await skipAdFixed(dev);
    }
  }

  return false;
}

/**
 * 고정 좌표로 광고 건너뛰기 (x85% y20%, 2회 탭)
 */
async function skipAdFixed(dev) {
  const scr = await dev.getScreenSize();
  const { x, y } = pctToAbs(COORDS.AD_SKIP.xPct, COORDS.AD_SKIP.yPct, scr.width, scr.height);
  log.info('ad_skip_fixed_tap', { x, y });
  await dev.tap(x, y);
  await sleep(800);
  await dev.tap(x, y);
  return true;
}

/**
 * 프리롤 광고 전체 처리 (최대 2개 연속, 5회 시도)
 * @returns {Promise<number>} 건너뛴 광고 수
 */
async function handlePrerollAds(dev) {
  log.info('preroll_start');
  await sleep(6000); // 건너뛰기 버튼 활성화 대기

  let adsSkipped = 0;
  for (let i = 0; i < 5; i++) {
    const skipped = await trySkipAd(dev);
    if (skipped) {
      adsSkipped++;
      log.info('preroll_skipped', { count: adsSkipped, attempt: i + 1 });
      await sleep(3000);
      continue;
    }

    // XML에 없어도 고정 좌표 시도
    await skipAdFixed(dev);
    await sleep(2000);

    // 광고 끝났는지 확인
    const ui = await dumpUI(dev);
    const hasTitle = ui.findByResourceId(RES.TITLE) || ui.findByResourceId(RES.VIDEO_TITLE);
    const hasAd = AD_SIGNALS.some(s => ui.contains(s));

    if (hasTitle && !hasAd) { log.info('preroll_done', { adsSkipped }); break; }
    if (hasAd) { adsSkipped++; log.info('preroll_another', { count: adsSkipped }); await sleep(6000); continue; }

    const state = await getPlaybackState(dev);
    if (state === 'playing') { log.info('preroll_playing'); break; }

    if (i < 4) await sleep(3000);
  }

  return adsSkipped;
}

// ═══════════════════════════════════════════════════════
// 재생 확인
// ═══════════════════════════════════════════════════════

/**
 * 재생 확인 + 재생 강제 시도
 * @returns {Promise<boolean>}
 */
async function ensurePlaying(dev) {
  const scr = await dev.getScreenSize();
  const px = Math.round(scr.width * COORDS.PLAYER_CENTER.xPct / 100);
  const py = Math.round(scr.height * COORDS.PLAYER_CENTER.yPct / 100);

  // 플레이어 탭 (컨트롤 표시) → 재생 버튼 탭
  await dev.tap(px, py);
  await sleep(800);
  await dev.tap(px, py);
  await sleep(1000);
  await dev.keyEvent('KEYCODE_MEDIA_PLAY');
  await sleep(1000);

  const state = await getPlaybackState(dev);
  log.info('playback_state', { state });
  return state === 'playing';
}

// ═══════════════════════════════════════════════════════
// 인간 행동 시뮬레이션
// ═══════════════════════════════════════════════════════

/**
 * 랜덤 인간 행동 삽입 (봇 감지 방지)
 * 30% 확률로 실행됨. 스크롤, 볼륨 조절, 일시정지 등.
 */
async function simulateHumanBehavior(dev) {
  if (Math.random() > 0.30) return; // 70%는 아무것도 안 함

  const scr = await dev.getScreenSize();
  const action = randInt(1, 5);

  switch (action) {
    case 1: // 살짝 아래 스크롤 후 복귀
      await dev.swipe(scr.width / 2, scr.height * 0.5, scr.width / 2, scr.height * 0.4, 300);
      await sleep(randInt(1000, 2000));
      await dev.swipe(scr.width / 2, scr.height * 0.4, scr.width / 2, scr.height * 0.5, 300);
      break;

    case 2: // 볼륨 업/다운
      await dev.keyEvent(randInt(0, 1) ? 'KEYCODE_VOLUME_UP' : 'KEYCODE_VOLUME_DOWN');
      await sleep(500);
      await dev.keyEvent(randInt(0, 1) ? 'KEYCODE_VOLUME_UP' : 'KEYCODE_VOLUME_DOWN');
      break;

    case 3: // 플레이어 영역 가볍게 탭 (컨트롤 표시 → 자동 숨김)
      await dev.tap(
        Math.round(scr.width * (0.3 + Math.random() * 0.4)),
        Math.round(scr.height * COORDS.PLAYER_CENTER.yPct / 100)
      );
      break;

    case 4: // 아무것도 안 함 (자연스러운 대기)
      break;

    case 5: // 시크바 근처 탭 (시간 변경 시뮬레이션 — 실제 변경은 안 됨)
      await dev.tap(
        Math.round(scr.width * (0.2 + Math.random() * 0.6)),
        Math.round(scr.height * COORDS.PLAYER_CENTER.yPct / 100)
      );
      await sleep(800);
      break;
  }

  log.debug('human_behavior', { action });
}

// ═══════════════════════════════════════════════════════
// 시청 메인 루프
// ═══════════════════════════════════════════════════════

/**
 * @typedef {object} WatchResult
 * @property {number} actualDurationSec - 실제 시청 시간
 * @property {number} watchPercentage - 시청 비율 (%)
 * @property {number} adsSkipped - 건너뛴 광고 수
 * @property {boolean} completed - 정상 완료 여부
 * @property {string[]} errors - 발생한 에러 메시지
 */

/**
 * 영상 시청 루프
 * @param {import('../adb/client').ADBDevice} dev
 * @param {number} durationSec - 목표 시청 시간
 * @param {object} [options]
 * @param {Function} [options.onTick] - 매 틱 콜백 (elapsedSec) => void
 * @param {Function} [options.onAction] - 액션 시점 콜백 (elapsedSec, action) => Promise
 * @returns {Promise<WatchResult>}
 */
async function watchVideo(dev, durationSec, options = {}) {
  const startTime = Date.now();
  const targetMs = durationSec * 1000;
  const TICK_MS = 5000;
  const AD_CHECK_MS = 15000;
  const WAKE_MS = 30000;
  const HUMAN_MS = 20000;
  let elapsed = 0;
  const errors = [];

  log.info('watch_start', { durationSec });

  while (elapsed < targetMs) {
    const waitMs = Math.min(TICK_MS, targetMs - elapsed);
    await sleep(waitMs);
    elapsed += waitMs;
    const sec = elapsed / 1000;

    // 광고 체크 (15초마다)
    if (elapsed % AD_CHECK_MS < TICK_MS) {
      try { await trySkipAd(dev); } catch (e) { errors.push(`ad_check: ${e.message}`); }
    }

    // 화면 깨우기 (30초마다)
    if (elapsed % WAKE_MS < TICK_MS) {
      try { await dev.wakeUp(); } catch {}
    }

    // 인간 행동 (20초마다 기회)
    if (elapsed % HUMAN_MS < TICK_MS) {
      try { await simulateHumanBehavior(dev); } catch {}
    }

    // 외부 콜백 (액션 모듈 연동용)
    if (options.onTick) {
      try { await options.onTick(sec); } catch {}
    }
  }

  const actualDurationSec = Math.round((Date.now() - startTime) / 1000);
  const watchPercentage = durationSec > 0 ? Math.min(100, Math.round((actualDurationSec / durationSec) * 100)) : 0;

  log.info('watch_done', { actualDurationSec, watchPercentage, errors: errors.length });

  return {
    actualDurationSec,
    watchPercentage,
    adsSkipped: 0, // 프리롤은 별도 처리
    completed: errors.length === 0,
    errors,
  };
}

module.exports = {
  trySkipAd,
  skipAdFixed,
  handlePrerollAds,
  ensurePlaying,
  simulateHumanBehavior,
  watchVideo,
};
