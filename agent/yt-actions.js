/**
 * yt-actions.js — YouTube 액션 모듈 (좋아요, 구독, 댓글, 재생목록 저장)
 *
 * YTPlayer와 함께 사용. 시청 중 특정 시점에 확률 기반으로 액션 실행.
 * engagement-system-design.md 기반 구현.
 */

function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function _randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

/** 디바이스별 성격 타입 — 확률 배율 결정 */
const PERSONALITY_TYPES = {
  passive:  { likeMult: 0.3, commentMult: 0.0, subscribeMult: 0.2, weight: 30 },
  casual:   { likeMult: 0.7, commentMult: 0.3, subscribeMult: 0.5, weight: 40 },
  active:   { likeMult: 1.5, commentMult: 1.0, subscribeMult: 1.2, weight: 20 },
  superfan: { likeMult: 2.0, commentMult: 2.0, subscribeMult: 2.0, weight: 10 },
};

/** 시간대별 참여도 가중치 */
const TIME_WEIGHT = {
  0: 0.3, 1: 0.2, 2: 0.1, 3: 0.1, 4: 0.2, 5: 0.3,
  6: 0.5, 7: 0.7, 8: 0.8, 9: 0.9, 10: 1.0, 11: 1.0,
  12: 1.1, 13: 1.0, 14: 0.9, 15: 0.9, 16: 1.0, 17: 1.1,
  18: 1.2, 19: 1.3, 20: 1.3, 21: 1.2, 22: 1.0, 23: 0.7,
};

class YTActions {
  /**
   * @param {import('./yt-player')} player - YTPlayer 인스턴스
   */
  constructor(player) {
    this.player = player;
    this._personalityCache = new Map(); // serial → personality type
  }

  // ═══════════════════════════════════════════════════════
  // 성격 & 확률 시스템
  // ═══════════════════════════════════════════════════════

  /** 디바이스별 고정 성격 반환 (최초 할당 후 캐싱) */
  getPersonality(serial) {
    if (this._personalityCache.has(serial)) return this._personalityCache.get(serial);
    const roll = Math.random() * 100;
    let cumulative = 0;
    let type = 'casual';
    for (const [name, data] of Object.entries(PERSONALITY_TYPES)) {
      cumulative += data.weight;
      if (roll < cumulative) { type = name; break; }
    }
    this._personalityCache.set(serial, type);
    console.log(`[YTActions] ${serial} 성격: ${type}`);
    return type;
  }

  /**
   * 확률 계산 (기본값 × 성격 배율 × 시간대 가중치)
   * @param {object} probs - { like: 15, comment: 5, subscribe: 8, playlist: 3 }
   * @param {string} serial
   * @returns {object} { like, comment, subscribe, playlist } — 0.0~1.0
   */
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

  /**
   * 어떤 액션을 할지 사전 결정
   * @returns {object} { willLike, willComment, willSubscribe, willPlaylist, likeAt, commentAt, ... }
   */
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
  // 개별 액션
  // ═══════════════════════════════════════════════════════

  /**
   * 좋아요 실행
   * @returns {Promise<boolean>} 성공 여부
   */
  async doLike(serial) {
    console.log(`[YTActions] ${serial} 좋아요 시도`);
    try {
      // 좋아요 버튼 영역 노출 (살짝 스크롤)
      const scr = await this.player.getScreen(serial);
      await this.player.adb(serial,
        `input swipe ${Math.round(scr.w / 2)} ${Math.round(scr.h * 0.55)} ${Math.round(scr.w / 2)} ${Math.round(scr.h * 0.40)} 300`);
      await _sleep(1000);

      // resource-id 우선 → content-desc 폴백
      let ok = await this.player.findAndTap(serial, {
        resourceId: 'com.google.android.youtube:id/like_button',
      });
      if (!ok) {
        ok = await this.player.findAndTap(serial, { contentDesc: '좋아요' });
      }

      if (ok) {
        await _sleep(1000);
        const liked = await this.player.hasElement(serial, { contentDesc: '좋아요 취소' })
          || await this.player.hasElement(serial, { contentDesc: '좋아요 표시함' });
        console.log(`[YTActions] ${serial} 좋아요 ${liked ? '✓ 완료' : '⚠ 상태 불명 (이미 눌렸을 수 있음)'}`);
        // 스크롤 복귀
        await this.player.adb(serial,
          `input swipe ${Math.round(scr.w / 2)} ${Math.round(scr.h * 0.40)} ${Math.round(scr.w / 2)} ${Math.round(scr.h * 0.55)} 300`);
        return true;
      }
      console.log(`[YTActions] ${serial} 좋아요 버튼 못 찾음`);
      return false;
    } catch (err) {
      console.error(`[YTActions] ${serial} 좋아요 에러: ${err.message}`);
      return false;
    }
  }

  /**
   * 구독 실행
   * @returns {Promise<boolean>}
   */
  async doSubscribe(serial) {
    console.log(`[YTActions] ${serial} 구독 시도`);
    try {
      // 이미 구독 중인지 확인
      const alreadySub = await this.player.hasElement(serial, { textContains: '구독 중' })
        || await this.player.hasElement(serial, { contentDesc: '구독함' });
      if (alreadySub) {
        console.log(`[YTActions] ${serial} 이미 구독 중 — 스킵`);
        return false;
      }

      let ok = await this.player.findAndTap(serial, {
        resourceId: 'com.google.android.youtube:id/subscribe_button',
      });
      if (!ok) {
        ok = await this.player.findAndTap(serial, { contentDesc: '구독' });
      }

      if (ok) {
        await _sleep(1500);
        console.log(`[YTActions] ${serial} 구독 ✓`);
        return true;
      }
      console.log(`[YTActions] ${serial} 구독 버튼 못 찾음`);
      return false;
    } catch (err) {
      console.error(`[YTActions] ${serial} 구독 에러: ${err.message}`);
      return false;
    }
  }

  /**
   * 댓글 작성
   * @param {string} serial
   * @param {string} commentText - 댓글 내용
   * @returns {Promise<boolean>}
   */
  async doComment(serial, commentText) {
    if (!commentText) return false;
    console.log(`[YTActions] ${serial} 댓글 시도: "${commentText}"`);
    try {
      const scr = await this.player.getScreen(serial);
      const midX = Math.round(scr.w / 2);

      // 댓글 영역까지 스크롤
      for (let i = 0; i < 3; i++) {
        await this.player.adb(serial,
          `input swipe ${midX} ${Math.round(scr.h * 0.80)} ${midX} ${Math.round(scr.h * 0.30)} 400`);
        await _sleep(1500);

        const found = await this.player.findAndTap(serial, {
          resourceId: 'com.google.android.youtube:id/comment_composer_input',
        }) || await this.player.findAndTap(serial, {
          contentDesc: '댓글 추가',
        }) || await this.player.findAndTap(serial, {
          textContains: '공개 댓글',
        });

        if (found) break;
      }

      await _sleep(1500);

      // 한글 입력: ADBKeyboard → 클립보드 → ASCII 폴백
      const b64 = Buffer.from(commentText, 'utf-8').toString('base64');
      let inputOk = false;

      try {
        const res = await this.player.adb(serial,
          `am broadcast -a ADB_INPUT_B64 --es msg '${b64}' 2>/dev/null`);
        const out = typeof res === 'string' ? res :
          (res?.data ? Object.values(res.data)[0] || '' : '');
        if (out.includes('result=0')) inputOk = true;
      } catch {}

      if (!inputOk) {
        try {
          const safe = commentText.replace(/'/g, '').replace(/"/g, '');
          await this.player.adb(serial, `am broadcast -a clipper.set -e text '${safe}' 2>/dev/null`);
          await _sleep(300);
          await this.player.adb(serial, 'input keyevent 279');
          inputOk = true;
        } catch {}
      }

      if (!inputOk && /^[\x20-\x7e]+$/.test(commentText)) {
        const forInput = commentText.replace(/ /g, '%s').replace(/'/g, '');
        await this.player.adb(serial, `input text '${forInput}'`);
        inputOk = true;
      }

      if (!inputOk) {
        console.log(`[YTActions] ${serial} 댓글 입력 실패`);
        await this.player.adb(serial, 'input keyevent KEYCODE_BACK');
        return false;
      }

      await _sleep(1000);

      // 게시 버튼
      const posted = await this.player.findAndTap(serial, {
        resourceId: 'com.google.android.youtube:id/comment_post_button',
      }) || await this.player.findAndTap(serial, {
        contentDesc: '보내기',
      }) || await this.player.findAndTap(serial, {
        contentDesc: 'Send',
      });

      if (posted) {
        await _sleep(2000);
        console.log(`[YTActions] ${serial} 댓글 ✓: "${commentText}"`);
      } else {
        console.log(`[YTActions] ${serial} 게시 버튼 못 찾음`);
      }

      // 영상으로 스크롤 복귀
      await this.player.adb(serial,
        `input swipe ${midX} ${Math.round(scr.h * 0.30)} ${midX} ${Math.round(scr.h * 0.80)} 400`);
      await _sleep(500);
      await this.player.adb(serial,
        `input swipe ${midX} ${Math.round(scr.h * 0.30)} ${midX} ${Math.round(scr.h * 0.80)} 400`);

      return !!posted;
    } catch (err) {
      console.error(`[YTActions] ${serial} 댓글 에러: ${err.message}`);
      return false;
    }
  }

  /**
   * 재생목록에 저장
   * @returns {Promise<boolean>}
   */
  async doSavePlaylist(serial) {
    console.log(`[YTActions] ${serial} 재생목록 저장 시도`);
    try {
      let ok = await this.player.findAndTap(serial, {
        resourceId: 'com.google.android.youtube:id/save_to_playlist_button',
      });
      if (!ok) {
        ok = await this.player.findAndTap(serial, { contentDesc: '재생목록에 저장' });
      }
      if (!ok) {
        ok = await this.player.findAndTap(serial, { contentDesc: '저장' });
      }

      if (ok) {
        await _sleep(1500);
        // "나중에 볼 동영상" 선택
        await this.player.findAndTap(serial, { textContains: '나중에 볼 동영상' });
        await _sleep(1000);
        console.log(`[YTActions] ${serial} 재생목록 저장 ✓`);
        return true;
      }
      console.log(`[YTActions] ${serial} 저장 버튼 못 찾음`);
      return false;
    } catch (err) {
      console.error(`[YTActions] ${serial} 저장 에러: ${err.message}`);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════
  // 통합 실행 (시청 루프 내에서 호출)
  // ═══════════════════════════════════════════════════════

  /**
   * 시청 루프 + 액션 통합 실행
   * @param {string} serial
   * @param {number} durationSec - 시청 시간
   * @param {object} plan - planActions() 결과
   * @param {string|null} commentText - 미리 생성된 댓글 (null이면 댓글 스킵)
   * @returns {Promise<{liked, commented, subscribed, playlisted}>}
   */
  async executeWatchLoop(serial, durationSec, plan, commentText) {
    const actions = { liked: false, commented: false, subscribed: false, playlisted: false };
    const targetMs = durationSec * 1000;
    const TICK_MS = 5000;
    let elapsed = 0;

    console.log(`[YTActions] ${serial} 시청 시작 (${durationSec}s) — like:${plan.willLike} comment:${plan.willComment} sub:${plan.willSubscribe} save:${plan.willPlaylist}`);

    while (elapsed < targetMs) {
      const waitMs = Math.min(TICK_MS, targetMs - elapsed);
      await _sleep(waitMs);
      elapsed += waitMs;
      const sec = elapsed / 1000;

      // 광고 체크 (15초마다)
      if (elapsed % 15000 < TICK_MS) {
        await this.player.trySkipAd(serial);
      }
      // 화면 깨우기 (30초마다)
      if (elapsed % 30000 < TICK_MS) {
        await this.player.adb(serial, 'input keyevent KEYCODE_WAKEUP');
      }

      // 좋아요 (시청 20~40% 시점)
      if (plan.willLike && !actions.liked && sec >= plan.likeAt) {
        actions.liked = await this.doLike(serial);
        await _sleep(_randInt(500, 1500));
      }

      // 댓글 (시청 40~65% 시점)
      if (plan.willComment && !actions.commented && sec >= plan.commentAt && commentText) {
        actions.commented = await this.doComment(serial, commentText);
        await _sleep(_randInt(1000, 2000));
      }

      // 구독 (시청 60~80% 시점)
      if (plan.willSubscribe && !actions.subscribed && sec >= plan.subscribeAt) {
        actions.subscribed = await this.doSubscribe(serial);
        await _sleep(_randInt(500, 1500));
      }

      // 재생목록 저장 (시청 85~95% 시점)
      if (plan.willPlaylist && !actions.playlisted && sec >= plan.playlistAt) {
        actions.playlisted = await this.doSavePlaylist(serial);
      }
    }

    console.log(`[YTActions] ${serial} 시청 완료 — liked:${actions.liked} commented:${actions.commented} sub:${actions.subscribed} saved:${actions.playlisted}`);
    return actions;
  }
}

module.exports = YTActions;
