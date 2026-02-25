/**
 * agent/youtube/flows.js — YouTube E2E 미션 플로우
 *
 * 모든 서브모듈 (search, watch, verify, action)을 하나의 미션으로 조합.
 * 에러 타입별 자동 처리: ADBError → 리트라이, BotDetection → 쿨다운, AccountBan → 계정 교체.
 *
 * 사용법:
 *   const { executeYouTubeMission } = require('./youtube');
 *   const result = await executeYouTubeMission(dev, mission, { accountService, proxyService, commentGenerator });
 */
const { getLogger } = require('../common/logger');
const { retry } = require('../common/retry');
const { ADBError, YouTubeDetectionError, AccountBannedError, YouTubeError } = require('../common/errors');
const { sleep, randInt } = require('../adb/helpers');
const { getPlaybackState } = require('../adb/screen');

const { searchAndSelect } = require('./search');
const { handlePrerollAds, ensurePlaying, watchVideo, trySkipAd } = require('./watch');
const { getVideoInfo, verifyVideoMatch, verifyPlaying, detectBotWarning } = require('./verify');
const { likeVideo, subscribeChannel, writeComment, saveToPlaylist } = require('./action');

const log = getLogger('youtube.flows');

/**
 * @typedef {object} Mission
 * @property {string} type - 'watch_and_engage' | 'watch_only' | 'engage_only'
 * @property {string} [videoId] - YouTube video ID
 * @property {string} keyword - 검색어
 * @property {number} [watchDuration=60] - 시청 시간 (초)
 * @property {string[]} [actions=[]] - ['like', 'comment', 'subscribe', 'save']
 * @property {string} [commentText] - 댓글 내용 (없으면 GPT 생성)
 * @property {number} [probLike=15] - 좋아요 확률 (0~100, 100이면 무조건)
 * @property {number} [probComment=5]
 * @property {number} [probSubscribe=8]
 * @property {number} [probSave=3]
 */

/**
 * @typedef {object} MissionResult
 * @property {boolean} success
 * @property {number} watchedSec - 실제 시청 시간
 * @property {number} watchPct - 시청 비율 (%)
 * @property {number} adsSkipped
 * @property {object} videoInfo - { videoId, title, channel }
 * @property {object} verification - { matched, score }
 * @property {object} actions - { liked, commented, subscribed, saved }
 * @property {string[]} errors
 * @property {string} [abortReason] - 중단 사유
 */

/**
 * YouTube E2E 미션 실행
 *
 * @param {import('../adb/client').ADBDevice} dev - ADB 디바이스
 * @param {Mission} mission - 미션 설정
 * @param {object} [services] - 선택적 서비스 주입
 * @param {object} [services.accountService] - AccountService (밴/쿨다운 처리)
 * @param {object} [services.commentGenerator] - CommentGenerator (GPT 댓글)
 * @param {string} [services.accountId] - 현재 계정 ID
 * @returns {Promise<MissionResult>}
 */
async function executeYouTubeMission(dev, mission, services = {}) {
  const serial = dev.serial;
  const startTime = Date.now();
  const errors = [];
  const result = {
    success: false,
    watchedSec: 0,
    watchPct: 0,
    adsSkipped: 0,
    videoInfo: {},
    verification: {},
    actions: { liked: null, commented: null, subscribed: null, saved: null },
    errors: [],
    abortReason: null,
  };

  log.info('mission_start', {
    serial,
    type: mission.type,
    keyword: mission.keyword,
    duration: mission.watchDuration,
    actions: mission.actions,
  });

  try {
    // ══════════ 1. 기기 상태 확인 ══════════
    log.info('step_1_device_check', { serial });
    if (!dev.isConnected) {
      result.abortReason = 'device_disconnected';
      throw new ADBError('Device not connected', { serial });
    }

    // ══════════ 2. 봇 감지 사전 체크 ══════════
    const preBotCheck = await detectBotWarning(dev);
    if (preBotCheck.detected) {
      result.abortReason = `bot_detected:${preBotCheck.type}`;
      await _handleBotDetection(preBotCheck.type, services, serial);
      throw new YouTubeDetectionError(preBotCheck.type, { serial });
    }

    // ══════════ 3. 기기 준비 ══════════
    log.info('step_3_prepare', { serial });
    await dev.wakeUp();
    await dev.forcePortrait();

    // ══════════ 4. 영상 검색 → 선택 ══════════
    log.info('step_4_search', { serial, keyword: mission.keyword });
    const searchResult = await retry(
      () => searchAndSelect(dev, mission.keyword),
      { maxAttempts: 2, delay: 3000, retryOn: [ADBError], label: 'search' }
    );

    if (!searchResult.selected) {
      errors.push('search_failed');
      log.error('search_failed', { serial, keyword: mission.keyword });
    }

    // ══════════ 5. 광고 건너뛰기 ══════════
    log.info('step_5_ads', { serial });
    result.adsSkipped = await handlePrerollAds(dev);

    // ══════════ 6. 재생 확인 ══════════
    log.info('step_6_playback', { serial });
    const playing = await ensurePlaying(dev);
    if (!playing) {
      errors.push('playback_failed');
      log.warn('playback_not_confirmed', { serial });
    }

    // ══════════ 7. 영상 정보 + 검증 ══════════
    log.info('step_7_verify', { serial });
    result.videoInfo = await getVideoInfo(dev, mission.keyword);
    result.verification = verifyVideoMatch(mission.keyword, result.videoInfo);

    // ══════════ 8. 댓글 사전 생성 (시청 중 대기 최소화) ══════════
    let commentText = mission.commentText || null;
    const shouldComment = _shouldDoAction(mission, 'comment');

    if (shouldComment && !commentText && services.commentGenerator) {
      log.info('step_8_comment_gen', { serial });
      try {
        commentText = await services.commentGenerator.generate(
          result.videoInfo.title || mission.keyword,
          result.videoInfo.channel || ''
        );
      } catch (err) {
        errors.push(`comment_gen: ${err.message}`);
        log.warn('comment_gen_failed', { serial, error: err.message });
      }
    }

    // ══════════ 9. 시청 + 액션 ══════════
    const watchDuration = mission.watchDuration || 60;
    log.info('step_9_watch', { serial, duration: watchDuration });

    // 액션 타이밍 결정
    const actionTimings = _planActionTimings(watchDuration, mission);

    const watchResult = await watchVideo(dev, watchDuration, {
      onTick: async (sec) => {
        // 좋아요
        if (actionTimings.like && !result.actions.liked && sec >= actionTimings.like.at) {
          result.actions.liked = await likeVideo(dev);
          await sleep(randInt(500, 1500));
        }

        // 구독
        if (actionTimings.subscribe && !result.actions.subscribed && sec >= actionTimings.subscribe.at) {
          result.actions.subscribed = await subscribeChannel(dev);
          await sleep(randInt(500, 1500));
        }

        // 댓글
        if (actionTimings.comment && !result.actions.commented && sec >= actionTimings.comment.at && commentText) {
          result.actions.commented = await writeComment(dev, commentText);
          await sleep(randInt(1000, 2000));
        }

        // 저장
        if (actionTimings.save && !result.actions.saved && sec >= actionTimings.save.at) {
          result.actions.saved = await saveToPlaylist(dev);
        }

        // 중간 봇 체크 (60초마다)
        if (sec > 0 && sec % 60 === 0) {
          const botCheck = await detectBotWarning(dev);
          if (botCheck.detected) {
            result.abortReason = `bot_mid_watch:${botCheck.type}`;
            throw new YouTubeDetectionError(botCheck.type, { serial });
          }
        }
      },
    });

    result.watchedSec = watchResult.actualDurationSec;
    result.watchPct = watchResult.watchPercentage;
    errors.push(...watchResult.errors);

    // ══════════ 10. 시청 후 스크린샷 ══════════
    try {
      const screenshotPath = await _saveScreenshot(dev, result.videoInfo.videoId || 'unknown');
      if (screenshotPath) {
        result.screenshotPath = screenshotPath;
        log.info('step_10_screenshot', { serial, path: screenshotPath });
      }
    } catch (err) {
      log.warn('screenshot_failed', { serial, error: err.message });
    }

    // ══════════ 11. 종료 ══════════
    log.info('step_11_finish', { serial });
    await dev.goHome();

    result.success = true;

  } catch (err) {
    // ── 에러 타입별 처리 ──

    if (err instanceof YouTubeDetectionError) {
      log.error('mission_bot_detected', { serial, type: err.detectionType });
      await _handleBotDetection(err.detectionType, services, serial);
      result.abortReason = result.abortReason || `bot:${err.detectionType}`;

    } else if (err instanceof AccountBannedError) {
      log.error('mission_account_banned', { serial, accountId: err.accountId });
      if (services.accountService && services.accountId) {
        await services.accountService.markBanned(services.accountId, err.reason || 'mission_error');
      }
      result.abortReason = 'account_banned';

    } else if (err instanceof ADBError) {
      log.error('mission_adb_error', { serial, error: err.message });
      result.abortReason = 'adb_error';

    } else {
      log.error('mission_unexpected_error', { serial, error: err.message, stack: err.stack });
      result.abortReason = 'unexpected_error';
    }

    errors.push(err.message);

    // 홈으로 복귀 시도
    try { await dev.goHome(); } catch {}
  }

  // ── 결과 로깅 ──
  result.errors = errors;
  const elapsed = Math.round((Date.now() - startTime) / 1000);

  log.info('mission_complete', {
    serial,
    success: result.success,
    elapsed,
    watchedSec: result.watchedSec,
    adsSkipped: result.adsSkipped,
    liked: result.actions.liked?.success,
    commented: result.actions.commented?.success,
    subscribed: result.actions.subscribed?.success,
    saved: result.actions.saved?.success,
    errors: errors.length,
    abortReason: result.abortReason,
  });

  return result;
}

// ═══════════════════════════════════════════════════════
// 헬퍼
// ═══════════════════════════════════════════════════════

/** 액션 실행 여부 결정 (actions 배열 또는 확률 기반) */
function _shouldDoAction(mission, actionName) {
  // actions 배열이 지정되면 그것 기준
  if (mission.actions && mission.actions.length > 0) {
    return mission.actions.includes(actionName);
  }
  // 확률 기반
  const probMap = { like: 'probLike', comment: 'probComment', subscribe: 'probSubscribe', save: 'probSave' };
  const prob = mission[probMap[actionName]];
  if (prob !== undefined) return Math.random() * 100 < prob;
  return false;
}

/** 액션 타이밍 계획 */
function _planActionTimings(durationSec, mission) {
  const plan = {};

  if (_shouldDoAction(mission, 'like')) {
    plan.like = { at: durationSec * (randInt(20, 40) / 100) };
  }
  if (_shouldDoAction(mission, 'comment')) {
    plan.comment = { at: durationSec * (randInt(40, 65) / 100) };
  }
  if (_shouldDoAction(mission, 'subscribe')) {
    plan.subscribe = { at: durationSec * (randInt(60, 80) / 100) };
  }
  if (_shouldDoAction(mission, 'save')) {
    plan.save = { at: durationSec * (randInt(85, 95) / 100) };
  }

  return plan;
}

/** 봇 감지 시 처리 */
async function _handleBotDetection(type, services, serial) {
  if (!services.accountService || !services.accountId) return;

  switch (type) {
    case 'captcha':
    case 'unusual_traffic':
      await services.accountService.setCooldown(services.accountId, 120); // 2시간 쿨다운
      break;
    case 'account_suspended':
      await services.accountService.markBanned(services.accountId, type);
      break;
    case 'login_required':
      await services.accountService.setCooldown(services.accountId, 30); // 30분
      break;
  }
}

/**
 * 스크린샷 저장 (PC 로컬 + DB 경로 기록)
 * 경로: agent/screenshots/YYYY-MM-DD/{serial}_{timestamp}_{videoId}.png
 */
async function _saveScreenshot(dev, videoId) {
  const fs = require('fs');
  const path = require('path');

  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const shortSerial = dev.serial.substring(0, 12);

  const dir = path.resolve(__dirname, '..', 'screenshots', dateStr);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `${shortSerial}_${timestamp}_${videoId}.png`;
  const localPath = path.join(dir, filename);
  const remotePath = '/sdcard/screenshot_temp.png';

  // 디바이스에서 스크린샷 촬영
  await dev.shell(`screencap -p ${remotePath}`);
  await new Promise(r => setTimeout(r, 500));

  // Xiaowei pullFile로 PC에 저장
  try {
    await dev.xiaowei.send({
      action: 'pullFile',
      devices: dev.serial,
      data: { remotePath, localPath },
    });
  } catch {
    // pullFile 미지원 시 adb pull 대체
    await dev.adb(`pull ${remotePath} "${localPath}"`);
  }

  // 디바이스 임시 파일 삭제
  await dev.shell(`rm ${remotePath}`).catch(() => {});

  return localPath;
}

module.exports = { executeYouTubeMission };
