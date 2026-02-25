/**
 * yt-actions.js — YouTube 액션 모듈 (좋아요, 구독, 댓글, 재생목록 저장)
 *
 * 원칙:
 *   1순위: resource-id로 요소 탐색 (해상도 무관)
 *   2순위: content-desc / text로 탐색
 *   3순위: 고정 좌표 (최후 수단)
 *   모든 액션 후 결과 검증 + 상세 로깅
 *
 * engagement-system-design.md 기반.
 */

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

const PERSONALITY_TYPES = {
  passive:  { likeMult: 0.3, commentMult: 0.0, subscribeMult: 0.2, weight: 30 },
  casual:   { likeMult: 0.7, commentMult: 0.3, subscribeMult: 0.5, weight: 40 },
  active:   { likeMult: 1.5, commentMult: 1.0, subscribeMult: 1.2, weight: 20 },
  superfan: { likeMult: 2.0, commentMult: 2.0, subscribeMult: 2.0, weight: 10 },
};

const TIME_WEIGHT = {
  0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.2, 5: 0.3,
  6: 0.5, 7: 0.7, 8: 0.8, 9: 0.9, 10: 1.0, 11: 1.0,
  12: 1.1, 13: 1.0, 14: 0.9, 15: 0.9, 16: 1.0, 17: 1.1,
  18: 1.2, 19: 1.3, 20: 1.3, 21: 1.2, 22: 1.0, 23: 0.7,
};

/** resource-id 상수 */
const RES = {
  LIKE:             'com.google.android.youtube:id/like_button',
  LIKE_SHORTS:      'com.google.android.youtube:id/reel_like_button',
  SUBSCRIBE:        'com.google.android.youtube:id/subscribe_button',
  COMMENT_ENTRY:    'com.google.android.youtube:id/comments_entry_point_header',
  COMMENT_INPUT:    'com.google.android.youtube:id/comment_composer_input',
  COMMENT_SUBMIT:   'com.google.android.youtube:id/comment_composer_submit_button',
  SAVE_PLAYLIST:    'com.google.android.youtube:id/save_to_playlist_button',
  SAVE_MENU:        'com.google.android.youtube:id/menu_item_save_to_playlist',
};

class YTActions {
  constructor(player) {
    this.player = player;
    this._personalityCache = new Map();
  }

  // ═══════════════════════════════════════════════════════
  // 성격 & 확률
  // ═══════════════════════════════════════════════════════

  getPersonality(serial) {
    if (this._personalityCache.has(serial)) return this._personalityCache.get(serial);
    const roll = Math.random() * 100;
    let cumulative = 0, type = 'casual';
    for (const [name, data] of Object.entries(PERSONALITY_TYPES)) {
      cumulative += data.weight;
      if (roll < cumulative) { type = name; break; }
    }
    this._personalityCache.set(serial, type);
    console.log(`[YTActions] ${serial} 성격: ${type}`);
    return type;
  }

  calculateProbs(probs, serial) {
    const type = this.getPersonality(serial);
    const p = PERSONALITY_TYPES[type];
    const tw = TIME_WEIGHT[new Date().getHours()] || 1.0;
    return {
      like:      Math.min(1, (probs.like || 15) / 100 * p.likeMult * tw),
      comment:   Math.min(1, (probs.comment || 5) / 100 * p.commentMult * tw),
      subscribe: Math.min(1, (probs.subscribe || 8) / 100 * p.subscribeMult * tw),
      playlist:  Math.min(1, (probs.playlist || 3) / 100 * p.likeMult * tw),
    };
  }

  planActions(durationSec, probs, serial) {
    const p = this.calculateProbs(probs, serial);
    return {
      willLike:      Math.random() < p.like,
      willComment:   Math.random() < p.comment,
      willSubscribe: Math.random() < p.subscribe,
      willPlaylist:  Math.random() < p.playlist,
      likeAt:      durationSec * (_randInt(20, 40) / 100),
      commentAt:   durationSec * (_randInt(40, 65) / 100),
      subscribeAt: durationSec * (_randInt(60, 80) / 100),
      playlistAt:  durationSec * (_randInt(85, 95) / 100),
      probs: p,
    };
  }

  // ═══════════════════════════════════════════════════════
  // XML 유틸리티 (속성 추출)
  // ═══════════════════════════════════════════════════════

  /**
   * XML에서 특정 resource-id를 가진 노드의 속성값 추출
   * @returns {object|null} { bounds, selected, contentDesc, text } or null
   */
  _extractNodeAttrs(xml, resourceId) {
    if (!xml) return null;
    const escaped = resourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nodeRe = new RegExp('<node[^>]*resource-id="' + escaped + '"[^>]*/?>', 'i');
    const m = xml.match(nodeRe);
    if (!m) return null;
    const node = m[0];
    const attrs = {};

    const bounds = node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds) {
      attrs.bounds = {
        x: Math.round((parseInt(bounds[1]) + parseInt(bounds[3])) / 2),
        y: Math.round((parseInt(bounds[2]) + parseInt(bounds[4])) / 2),
      };
    }

    const sel = node.match(/selected="(true|false)"/i);
    if (sel) attrs.selected = sel[1] === 'true';

    const cd = node.match(/content-desc="([^"]*)"/i);
    if (cd) attrs.contentDesc = cd[1];

    const txt = node.match(/text="([^"]*)"/i);
    if (txt) attrs.text = txt[1];

    return attrs;
  }

  // ═══════════════════════════════════════════════════════
  // 좋아요
  // ═══════════════════════════════════════════════════════

  async doLike(serial) {
    const tag = `[YTActions] [Like] ${serial}`;
    console.log(`${tag} 시작`);

    try {
      // 1. XML에서 like_button 찾기
      let xml = await this.player.dumpUI(serial);
      let node = this._extractNodeAttrs(xml, RES.LIKE);

      if (node) {
        // 이미 좋아요 눌렸는지 확인
        if (node.selected === true || (node.contentDesc && (
          node.contentDesc.includes('좋아요 취소') || node.contentDesc.includes('좋아요 표시함')
        ))) {
          console.log(`${tag} ✓ 이미 좋아요 상태 — 스킵`);
          return { success: true, method: 'already_liked', skipped: true };
        }

        if (node.bounds) {
          console.log(`${tag} resource-id 발견 → 탭 (${node.bounds.x}, ${node.bounds.y})`);
          await this.player.adb(serial, `input tap ${node.bounds.x} ${node.bounds.y}`);
        } else {
          console.log(`${tag} resource-id 발견 but bounds 없음 → findAndTap`);
          await this.player.findAndTap(serial, { resourceId: RES.LIKE });
        }
      } else {
        // 2. content-desc 폴백
        const cdFound = await this.player.findAndTap(serial, { contentDesc: '좋아요' });
        if (!cdFound) {
          // 3. 고정 좌표 (최후 수단)
          const scr = await this.player.getScreen(serial);
          const fx = Math.round(scr.w * 0.48), fy = Math.round(scr.h * 0.52);
          console.log(`${tag} ⚠ XML 못 찾음 → 고정 좌표 (${fx}, ${fy})`);
          await this.player.adb(serial, `input tap ${fx} ${fy}`);
        } else {
          console.log(`${tag} content-desc "좋아요" 탭 완료`);
        }
      }

      await _sleep(1500);

      // 결과 검증
      xml = await this.player.dumpUI(serial);
      node = this._extractNodeAttrs(xml, RES.LIKE);
      const verified = node && (
        node.selected === true ||
        (node.contentDesc && (node.contentDesc.includes('좋아요 취소') || node.contentDesc.includes('좋아요 표시함')))
      );

      if (verified) {
        console.log(`${tag} ✅ 좋아요 완료 (검증됨: selected=${node.selected}, desc="${node.contentDesc}")`);
        return { success: true, method: 'verified', skipped: false };
      }
      console.log(`${tag} ⚠ 좋아요 탭했으나 검증 불가 (selected=${node?.selected}, desc="${node?.contentDesc || 'N/A'}")`);
      return { success: true, method: 'unverified', skipped: false };
    } catch (err) {
      console.error(`${tag} ❌ 에러: ${err.message}`);
      return { success: false, method: 'error', error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════
  // 구독
  // ═══════════════════════════════════════════════════════

  async doSubscribe(serial) {
    const tag = `[YTActions] [Subscribe] ${serial}`;
    console.log(`${tag} 시작`);

    try {
      // 1. XML에서 subscribe_button 찾기
      let xml = await this.player.dumpUI(serial);
      let node = this._extractNodeAttrs(xml, RES.SUBSCRIBE);

      if (node) {
        // 이미 구독 중인지 확인
        if (node.contentDesc && (node.contentDesc.includes('구독함') || node.contentDesc.includes('Subscribed'))) {
          console.log(`${tag} ✓ 이미 구독 중 — 스킵 (desc="${node.contentDesc}")`);
          return { success: true, method: 'already_subscribed', skipped: true };
        }
        if (node.text && (node.text.includes('구독 중') || node.text.includes('Subscribed'))) {
          console.log(`${tag} ✓ 이미 구독 중 — 스킵 (text="${node.text}")`);
          return { success: true, method: 'already_subscribed', skipped: true };
        }

        if (node.bounds) {
          console.log(`${tag} resource-id 발견 → 탭 (${node.bounds.x}, ${node.bounds.y})`);
          await this.player.adb(serial, `input tap ${node.bounds.x} ${node.bounds.y}`);
        } else {
          await this.player.findAndTap(serial, { resourceId: RES.SUBSCRIBE });
        }
      } else {
        const cdFound = await this.player.findAndTap(serial, { contentDesc: '구독' });
        if (!cdFound) {
          const scr = await this.player.getScreen(serial);
          const fx = Math.round(scr.w * 0.23), fy = Math.round(scr.h * 0.52);
          console.log(`${tag} ⚠ XML 못 찾음 → 고정 좌표 (${fx}, ${fy})`);
          await this.player.adb(serial, `input tap ${fx} ${fy}`);
        }
      }

      await _sleep(2000);

      // 결과 검증
      xml = await this.player.dumpUI(serial);
      node = this._extractNodeAttrs(xml, RES.SUBSCRIBE);
      const verified = node && (
        (node.contentDesc && (node.contentDesc.includes('구독함') || node.contentDesc.includes('Subscribed'))) ||
        (node.text && (node.text.includes('구독 중') || node.text.includes('Subscribed')))
      );

      if (verified) {
        console.log(`${tag} ✅ 구독 완료 (검증됨: desc="${node.contentDesc}", text="${node.text}")`);
        return { success: true, method: 'verified', skipped: false };
      }
      console.log(`${tag} ⚠ 구독 탭했으나 검증 불가 (desc="${node?.contentDesc || 'N/A'}", text="${node?.text || 'N/A'}")`);
      return { success: true, method: 'unverified', skipped: false };
    } catch (err) {
      console.error(`${tag} ❌ 에러: ${err.message}`);
      return { success: false, method: 'error', error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════
  // 댓글
  // ═══════════════════════════════════════════════════════

  async doComment(serial, commentText) {
    if (!commentText) return { success: false, method: 'no_text' };
    const tag = `[YTActions] [Comment] ${serial}`;
    console.log(`${tag} 시작 — "${commentText}"`);

    try {
      const scr = await this.player.getScreen(serial);
      const midX = Math.round(scr.w / 2);

      // 1. 댓글 섹션까지 스크롤 + 입력창 찾기
      let inputFound = false;
      for (let i = 0; i < 3; i++) {
        await this.player.adb(serial,
          `input swipe ${midX} ${Math.round(scr.h * 0.80)} ${midX} ${Math.round(scr.h * 0.30)} 400`);
        await _sleep(1500);

        // resource-id 우선
        inputFound = await this.player.findAndTap(serial, { resourceId: RES.COMMENT_ENTRY });
        if (!inputFound) inputFound = await this.player.findAndTap(serial, { resourceId: RES.COMMENT_INPUT });
        if (!inputFound) inputFound = await this.player.findAndTap(serial, { contentDesc: '댓글 추가' });
        if (!inputFound) inputFound = await this.player.findAndTap(serial, { textContains: '공개 댓글' });

        if (inputFound) {
          console.log(`${tag} 댓글 입력창 발견 (시도 ${i + 1})`);
          break;
        }
      }

      if (!inputFound) {
        console.log(`${tag} ❌ 댓글 입력창 못 찾음`);
        this._scrollBackToVideo(serial, scr);
        return { success: false, method: 'input_not_found' };
      }

      await _sleep(1500);

      // 2. 텍스트 입력 (ADBKeyboard → 클립보드 → ASCII)
      const inputMethod = await this._inputText(serial, commentText);
      if (!inputMethod) {
        console.log(`${tag} ❌ 텍스트 입력 실패`);
        await this.player.adb(serial, 'input keyevent KEYCODE_BACK');
        this._scrollBackToVideo(serial, scr);
        return { success: false, method: 'input_failed' };
      }
      console.log(`${tag} 텍스트 입력 완료 (방법: ${inputMethod})`);
      await _sleep(1000);

      // 3. 게시 버튼
      let posted = await this.player.findAndTap(serial, { resourceId: RES.COMMENT_SUBMIT });
      if (!posted) posted = await this.player.findAndTap(serial, { contentDesc: '보내기' });
      if (!posted) posted = await this.player.findAndTap(serial, { contentDesc: 'Send' });

      if (posted) {
        await _sleep(2000);
        console.log(`${tag} ✅ 댓글 게시 완료 — "${commentText}"`);
      } else {
        console.log(`${tag} ⚠ 게시 버튼 못 찾음 — 댓글 입력은 됨`);
      }

      // 4. 영상으로 복귀
      await this._scrollBackToVideo(serial, scr);
      return { success: !!posted, method: posted ? 'posted' : 'submit_not_found', inputMethod };
    } catch (err) {
      console.error(`${tag} ❌ 에러: ${err.message}`);
      return { success: false, method: 'error', error: err.message };
    }
  }

  async _scrollBackToVideo(serial, scr) {
    const midX = Math.round(scr.w / 2);
    await this.player.adb(serial,
      `input swipe ${midX} ${Math.round(scr.h * 0.30)} ${midX} ${Math.round(scr.h * 0.80)} 400`);
    await _sleep(300);
    await this.player.adb(serial,
      `input swipe ${midX} ${Math.round(scr.h * 0.30)} ${midX} ${Math.round(scr.h * 0.80)} 400`);
  }

  async _inputText(serial, text) {
    // 방법 1: ADBKeyboard broadcast
    const b64 = Buffer.from(text, 'utf-8').toString('base64');
    try {
      const res = await this.player.adb(serial, `am broadcast -a ADB_INPUT_B64 --es msg '${b64}' 2>/dev/null`);
      const out = typeof res === 'string' ? res : (res?.data ? Object.values(res.data)[0] || '' : '');
      if (out.includes('result=0')) return 'adb_keyboard';
    } catch {}

    // 방법 2: 클립보드 붙여넣기
    try {
      const safe = text.replace(/'/g, '').replace(/"/g, '');
      await this.player.adb(serial, `am broadcast -a clipper.set -e text '${safe}' 2>/dev/null`);
      await _sleep(300);
      await this.player.adb(serial, 'input keyevent 279');
      return 'clipboard';
    } catch {}

    // 방법 3: ASCII만 (한글 불가)
    if (/^[\x20-\x7e]+$/.test(text)) {
      const forInput = text.replace(/ /g, '%s').replace(/'/g, '');
      await this.player.adb(serial, `input text '${forInput}'`);
      return 'ascii';
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════
  // 재생목록 저장 (담기)
  // ═══════════════════════════════════════════════════════

  async doSavePlaylist(serial) {
    const tag = `[YTActions] [Save] ${serial}`;
    console.log(`${tag} 시작`);

    try {
      const scr = await this.player.getScreen(serial);
      const btnY = Math.round(scr.h * 0.52);

      // 1. 먼저 resource-id로 직접 찾기
      let found = await this.player.findAndTap(serial, { resourceId: RES.SAVE_PLAYLIST });
      if (!found) found = await this.player.findAndTap(serial, { resourceId: RES.SAVE_MENU });
      if (!found) found = await this.player.findAndTap(serial, { contentDesc: '저장' });

      // 2. 못 찾으면 버튼 행(y52%)에서 좌로 스크롤 (최대 2회)
      if (!found) {
        for (let swipeN = 1; swipeN <= 2; swipeN++) {
          console.log(`${tag} 저장 버튼 안 보임 → 좌로 스크롤 ${swipeN}회 (y=${btnY})`);
          await this.player.adb(serial,
            `input swipe ${Math.round(scr.w * 0.80)} ${btnY} ${Math.round(scr.w * 0.20)} ${btnY} 400`);
          await _sleep(1500);

          found = await this.player.findAndTap(serial, { resourceId: RES.SAVE_PLAYLIST });
          if (!found) found = await this.player.findAndTap(serial, { resourceId: RES.SAVE_MENU });
          if (!found) found = await this.player.findAndTap(serial, { contentDesc: '저장' });
          if (!found) found = await this.player.findAndTap(serial, { textContains: '저장' });
          if (found) break;
        }
      }

      if (!found) {
        console.log(`${tag} ❌ 저장 버튼 못 찾음`);
        // 스크롤 복귀
        await this.player.adb(serial,
          `input swipe ${Math.round(scr.w * 0.20)} ${btnY} ${Math.round(scr.w * 0.80)} ${btnY} 400`);
        return { success: false, method: 'button_not_found' };
      }

      await _sleep(1500);

      // 3. "나중에 볼 동영상" 선택
      const playlistSelected = await this.player.findAndTap(serial, { textContains: '나중에 볼 동영상' })
        || await this.player.findAndTap(serial, { textContains: 'Watch later' });

      await _sleep(1000);

      // 4. 결과 검증 — 토스트 메시지 또는 UI 변화 확인
      const xml = await this.player.dumpUI(serial);
      const saveConfirmed = xml && (
        xml.includes('저장됨') || xml.includes('Saved') ||
        xml.includes('재생목록에 추가') || xml.includes('Added to')
      );

      // 스크롤 복귀
      await this.player.adb(serial,
        `input swipe ${Math.round(scr.w * 0.20)} ${btnY} ${Math.round(scr.w * 0.80)} ${btnY} 400`);

      if (saveConfirmed) {
        console.log(`${tag} ✅ 저장 완료 (검증됨)`);
        return { success: true, method: 'verified', playlistSelected: !!playlistSelected };
      }
      console.log(`${tag} ⚠ 저장 탭 완료 (검증 불가 — 토스트 놓쳤을 수 있음)`);
      return { success: true, method: 'unverified', playlistSelected: !!playlistSelected };
    } catch (err) {
      console.error(`${tag} ❌ 에러: ${err.message}`);
      return { success: false, method: 'error', error: err.message };
    }
  }

  // ═══════════════════════════════════════════════════════
  // 통합 시청 루프
  // ═══════════════════════════════════════════════════════

  async executeWatchLoop(serial, durationSec, plan, commentText) {
    const results = { liked: null, commented: null, subscribed: null, playlisted: null };
    const targetMs = durationSec * 1000;
    const TICK_MS = 5000;
    let elapsed = 0;

    console.log(`[YTActions] ${serial} 시청 시작 (${durationSec}s) — like:${plan.willLike} comment:${plan.willComment} sub:${plan.willSubscribe} save:${plan.willPlaylist}`);

    while (elapsed < targetMs) {
      const waitMs = Math.min(TICK_MS, targetMs - elapsed);
      await _sleep(waitMs);
      elapsed += waitMs;
      const sec = elapsed / 1000;

      if (elapsed % 15000 < TICK_MS) await this.player.trySkipAd(serial);
      if (elapsed % 30000 < TICK_MS) await this.player.adb(serial, 'input keyevent KEYCODE_WAKEUP');

      if (plan.willLike && !results.liked && sec >= plan.likeAt) {
        results.liked = await this.doLike(serial);
        await _sleep(_randInt(500, 1500));
      }

      if (plan.willComment && !results.commented && sec >= plan.commentAt && commentText) {
        results.commented = await this.doComment(serial, commentText);
        await _sleep(_randInt(1000, 2000));
      }

      if (plan.willSubscribe && !results.subscribed && sec >= plan.subscribeAt) {
        results.subscribed = await this.doSubscribe(serial);
        await _sleep(_randInt(500, 1500));
      }

      if (plan.willPlaylist && !results.playlisted && sec >= plan.playlistAt) {
        results.playlisted = await this.doSavePlaylist(serial);
      }
    }

    // 최종 결과 로깅
    console.log(`[YTActions] ${serial} 시청 완료 — 결과:`);
    if (results.liked) console.log(`  좋아요: ${results.liked.success ? '✅' : '❌'} (${results.liked.method})`);
    if (results.commented) console.log(`  댓글: ${results.commented.success ? '✅' : '❌'} (${results.commented.method})`);
    if (results.subscribed) console.log(`  구독: ${results.subscribed.success ? '✅' : '❌'} (${results.subscribed.method})`);
    if (results.playlisted) console.log(`  저장: ${results.playlisted.success ? '✅' : '❌'} (${results.playlisted.method})`);

    return results;
  }
}

module.exports = YTActions;
