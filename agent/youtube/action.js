/**
 * agent/youtube/action.js — YouTube engagement 액션 (좋아요, 구독, 댓글, 저장)
 *
 * 원칙: resource-id 1순위 → content-desc 2순위 → 고정 좌표 3순위 (최후).
 * 모든 액션: 사전 상태 확인 → 실행 → 사후 검증 → 상세 결과 리턴.
 */
const { getLogger } = require('../common/logger');
const { dumpUI } = require('../adb/screen');
const { sleep, randInt, humanDelay, pctToAbs } = require('../adb/helpers');
const { RES, COORDS, ACTION_ROW_Y_PCT } = require('./selectors');

const log = getLogger('youtube.action');

/**
 * @typedef {object} ActionResult
 * @property {boolean} success
 * @property {string} method - 'verified'|'unverified'|'already_done'|'not_found'|'error'
 * @property {boolean} [skipped] - 이미 완료된 경우
 * @property {string} [error]
 */

// ═══════════════════════════════════════════════════════
// 좋아요
// ═══════════════════════════════════════════════════════

/**
 * 좋아요 실행 (이미 눌렸으면 스킵)
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<ActionResult>}
 */
async function likeVideo(dev) {
  const tag = 'like';
  log.info(`${tag}_start`, { serial: dev.serial });

  try {
    // 1. XML에서 like_button 찾기 + 상태 확인
    let ui = await dumpUI(dev);
    let node = ui.findByResourceId(RES.LIKE);

    if (node) {
      if (node.selected || (node.contentDesc && (
        node.contentDesc.includes('좋아요 취소') || node.contentDesc.includes('좋아요 표시함')
      ))) {
        log.info(`${tag}_already`, { serial: dev.serial });
        return { success: true, method: 'already_done', skipped: true };
      }

      if (node.hasBounds) {
        log.info(`${tag}_tap_xml`, { serial: dev.serial, x: node.cx, y: node.cy });
        await dev.tap(node.cx, node.cy);
      } else {
        await _tapByDescOrCoord(dev, ui, '좋아요', COORDS.LIKE, tag);
      }
    } else {
      await _tapByDescOrCoord(dev, ui, '좋아요', COORDS.LIKE, tag);
    }

    await sleep(randInt(1000, 2000));

    // 2. 검증
    ui = await dumpUI(dev);
    node = ui.findByResourceId(RES.LIKE);
    const verified = node && (
      node.selected ||
      (node.contentDesc && (node.contentDesc.includes('좋아요 취소') || node.contentDesc.includes('좋아요 표시함')))
    );

    log.info(`${tag}_result`, {
      serial: dev.serial,
      verified,
      selected: node?.selected,
      desc: node?.contentDesc || 'N/A',
    });

    return { success: true, method: verified ? 'verified' : 'unverified', skipped: false };
  } catch (err) {
    log.error(`${tag}_error`, { serial: dev.serial, error: err.message });
    return { success: false, method: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// 구독
// ═══════════════════════════════════════════════════════

/**
 * 구독 실행 (이미 구독이면 스킵)
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<ActionResult>}
 */
async function subscribeChannel(dev) {
  const tag = 'subscribe';
  log.info(`${tag}_start`, { serial: dev.serial });

  try {
    let ui = await dumpUI(dev);
    let node = ui.findByResourceId(RES.SUBSCRIBE);

    // 이미 구독 확인
    if (node) {
      const desc = node.contentDesc || '';
      const text = node.text || '';
      if (desc.includes('구독함') || desc.includes('Subscribed') ||
          text.includes('구독 중') || text.includes('Subscribed')) {
        log.info(`${tag}_already`, { serial: dev.serial, desc, text });
        return { success: true, method: 'already_done', skipped: true };
      }

      if (node.hasBounds) {
        log.info(`${tag}_tap_xml`, { serial: dev.serial, x: node.cx, y: node.cy });
        await dev.tap(node.cx, node.cy);
      } else {
        await _tapByDescOrCoord(dev, ui, '구독', COORDS.SUBSCRIBE, tag);
      }
    } else {
      await _tapByDescOrCoord(dev, ui, '구독', COORDS.SUBSCRIBE, tag);
    }

    await sleep(randInt(1500, 2500));

    // 검증
    ui = await dumpUI(dev);
    node = ui.findByResourceId(RES.SUBSCRIBE);
    const verified = node && (
      (node.contentDesc && (node.contentDesc.includes('구독함') || node.contentDesc.includes('Subscribed'))) ||
      (node.text && (node.text.includes('구독 중') || node.text.includes('Subscribed')))
    );

    log.info(`${tag}_result`, { serial: dev.serial, verified, desc: node?.contentDesc, text: node?.text });
    return { success: true, method: verified ? 'verified' : 'unverified', skipped: false };
  } catch (err) {
    log.error(`${tag}_error`, { serial: dev.serial, error: err.message });
    return { success: false, method: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// 댓글
// ═══════════════════════════════════════════════════════

/**
 * 댓글 작성 (스크롤 → 입력 → 게시)
 * @param {import('../adb/client').ADBDevice} dev
 * @param {string} commentText
 * @returns {Promise<ActionResult>}
 */
async function writeComment(dev, commentText) {
  if (!commentText) return { success: false, method: 'no_text' };
  const tag = 'comment';
  log.info(`${tag}_start`, { serial: dev.serial, text: commentText });

  try {
    const scr = await dev.getScreenSize();
    const midX = Math.round(scr.width / 2);

    // 1. 댓글 입력창 찾기 (스크롤 최대 3회)
    let inputFound = false;
    for (let i = 0; i < 3; i++) {
      await dev.swipe(midX, scr.height * 0.80, midX, scr.height * 0.30, 400);
      await sleep(1500);

      const ui = await dumpUI(dev);
      const node = ui.findByResourceId(RES.COMMENT_ENTRY)
        || ui.findByResourceId(RES.COMMENT_INPUT)
        || ui.findByContentDescContains('댓글 추가')
        || ui.findByTextContains('공개 댓글');

      if (node && node.hasBounds) {
        log.info(`${tag}_input_found`, { serial: dev.serial, x: node.cx, y: node.cy, attempt: i + 1 });
        await dev.tap(node.cx, node.cy);
        inputFound = true;
        break;
      }
    }

    // 고정 좌표 폴백
    if (!inputFound) {
      const { x, y } = pctToAbs(COORDS.COMMENT_FIELD.xPct, COORDS.COMMENT_FIELD.yPct, scr.width, scr.height);
      log.warn(`${tag}_input_fallback`, { serial: dev.serial, x, y });
      await dev.tap(x, y);
    }

    await sleep(1500);

    // 2. 텍스트 입력
    const inputMethod = await dev.inputText(commentText);
    if (!inputMethod) {
      log.error(`${tag}_input_failed`, { serial: dev.serial });
      await dev.goBack();
      await _scrollBackToVideo(dev, scr);
      return { success: false, method: 'input_failed' };
    }
    log.info(`${tag}_text_entered`, { serial: dev.serial, method: inputMethod });
    await sleep(1000);

    // 3. 게시 버튼
    let posted = false;
    const ui = await dumpUI(dev);
    const submitNode = ui.findByResourceId(RES.COMMENT_SUBMIT)
      || ui.findByContentDescContains('보내기')
      || ui.findByContentDescContains('Send');

    if (submitNode && submitNode.hasBounds) {
      await dev.tap(submitNode.cx, submitNode.cy);
      posted = true;
    } else {
      const { x, y } = pctToAbs(COORDS.COMMENT_SUBMIT.xPct, COORDS.COMMENT_SUBMIT.yPct, scr.width, scr.height);
      log.warn(`${tag}_submit_fallback`, { serial: dev.serial, x, y });
      await dev.tap(x, y);
      posted = true;
    }

    await sleep(2000);
    log.info(`${tag}_result`, { serial: dev.serial, posted, text: commentText, inputMethod });

    // 4. 영상으로 복귀
    await _scrollBackToVideo(dev, scr);
    return { success: posted, method: posted ? 'posted' : 'submit_not_found', inputMethod };
  } catch (err) {
    log.error(`${tag}_error`, { serial: dev.serial, error: err.message });
    return { success: false, method: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// 재생목록 저장 (담기)
// ═══════════════════════════════════════════════════════

/**
 * 재생목록에 저장 (좌로 스크롤 최대 2회)
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<ActionResult>}
 */
async function saveToPlaylist(dev) {
  const tag = 'save';
  log.info(`${tag}_start`, { serial: dev.serial });

  try {
    const scr = await dev.getScreenSize();
    const btnY = Math.round(scr.height * ACTION_ROW_Y_PCT / 100);

    // 1. resource-id로 직접 찾기
    let ui = await dumpUI(dev);
    let node = ui.findByResourceId(RES.SAVE_PLAYLIST)
      || ui.findByResourceId(RES.SAVE_MENU)
      || ui.findByContentDescContains('저장');

    // 2. 못 찾으면 좌로 스크롤 (최대 2회)
    if (!node || !node.hasBounds) {
      for (let s = 1; s <= 2; s++) {
        log.info(`${tag}_swipe`, { serial: dev.serial, attempt: s });
        await dev.swipe(scr.width * 0.80, btnY, scr.width * 0.20, btnY, 400);
        await sleep(1500);

        ui = await dumpUI(dev);
        node = ui.findByResourceId(RES.SAVE_PLAYLIST)
          || ui.findByResourceId(RES.SAVE_MENU)
          || ui.findByContentDescContains('저장')
          || ui.findByTextContains('저장');

        if (node && node.hasBounds) break;
      }
    }

    if (!node || !node.hasBounds) {
      log.warn(`${tag}_not_found`, { serial: dev.serial });
      await _swipeButtonRowBack(dev, scr, btnY);
      return { success: false, method: 'not_found' };
    }

    await dev.tap(node.cx, node.cy);
    await sleep(1500);

    // 3. "나중에 볼 동영상" 선택
    const playlistUI = await dumpUI(dev);
    const watchLater = playlistUI.findByTextContains('나중에 볼 동영상')
      || playlistUI.findByTextContains('Watch later');
    if (watchLater && watchLater.hasBounds) {
      await dev.tap(watchLater.cx, watchLater.cy);
    }
    await sleep(1000);

    // 4. 검증
    const afterUI = await dumpUI(dev);
    const confirmed = afterUI.contains('저장됨') || afterUI.contains('Saved') || afterUI.contains('재생목록에 추가');

    await _swipeButtonRowBack(dev, scr, btnY);

    log.info(`${tag}_result`, { serial: dev.serial, confirmed });
    return { success: true, method: confirmed ? 'verified' : 'unverified' };
  } catch (err) {
    log.error(`${tag}_error`, { serial: dev.serial, error: err.message });
    return { success: false, method: 'error', error: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// 헬퍼
// ═══════════════════════════════════════════════════════

/** content-desc 탭 시도 → 고정 좌표 폴백 */
async function _tapByDescOrCoord(dev, ui, descKeyword, coordDef, tag) {
  const node = ui.findByContentDescContains(descKeyword);
  if (node && node.hasBounds) {
    log.info(`${tag}_tap_desc`, { serial: dev.serial, x: node.cx, y: node.cy });
    await dev.tap(node.cx, node.cy);
    return;
  }
  const scr = await dev.getScreenSize();
  const { x, y } = pctToAbs(coordDef.xPct, coordDef.yPct, scr.width, scr.height);
  log.warn(`${tag}_tap_fallback`, { serial: dev.serial, x, y });
  await dev.tap(x, y);
}

/** 영상으로 스크롤 복귀 */
async function _scrollBackToVideo(dev, scr) {
  const midX = Math.round(scr.width / 2);
  await dev.swipe(midX, scr.height * 0.30, midX, scr.height * 0.80, 400);
  await sleep(300);
  await dev.swipe(midX, scr.height * 0.30, midX, scr.height * 0.80, 400);
}

/** 버튼 행 스크롤 복귀 (우로) */
async function _swipeButtonRowBack(dev, scr, btnY) {
  await dev.swipe(scr.width * 0.20, btnY, scr.width * 0.80, btnY, 400);
}

module.exports = { likeVideo, subscribeChannel, writeComment, saveToPlaylist };
