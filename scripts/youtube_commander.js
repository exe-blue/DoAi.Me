/**
 * youtube_commander.js  v2.0
 * YouTube 전체 UI 오브젝트 기반 동적 명령 시스템
 * AutoX.js (Android) 전용
 *
 * 변경 이력 v2.0:
 *   [FIX] SelectorEngine.find() CPU 스핀 → sleep(150) 추가
 *   [FIX] desc 폴백 정밀화 (comment_cancel/submit/subscribe 충돌 제거)
 *   [FIX] descContains() 미정의 오류 → id 기반 text 필터로 교체
 *   [ADD] closeAllWindows() 액션
 *   [ADD] launch({ fromScratch: true }) 옵션
 *   [ADD] ScreenContext — 화면 컨텍스트 사전 검증
 *   [ADD] 모든 engagement 액션에 requireWatchPage 가드
 */

'use strict';

const YT_PKG = 'com.google.android.youtube';

// ============================================================
// 1. 셀렉터 레지스트리
// ============================================================
const SELECTORS = {

  // ── 상단 바 ────────────────────────────────────────────────
  search_button: [
    { type: 'id',   value: `${YT_PKG}:id/search_button` },
    { type: 'desc', value: '검색' },
    { type: 'desc', value: 'Search' },
  ],
  search_bar: [
    { type: 'id',   value: `${YT_PKG}:id/search_edit_text` },
    { type: 'class',value: 'android.widget.EditText' },
  ],
  toolbar: [
    { type: 'id',   value: `${YT_PKG}:id/toolbar` },
  ],

  // ── 플레이어 ───────────────────────────────────────────────
  player: [
    { type: 'id',   value: `${YT_PKG}:id/player_fragment_container` },
    { type: 'id',   value: `${YT_PKG}:id/watch_player` },
  ],
  play_pause: [
    { type: 'id',   value: `${YT_PKG}:id/player_control_play_pause_replay_button` },
  ],
  next_button: [
    { type: 'id',   value: `${YT_PKG}:id/next_button` },
  ],
  seekbar: [
    { type: 'id',   value: `${YT_PKG}:id/time_bar` },
    { type: 'class',value: 'android.widget.SeekBar' },
  ],
  current_time: [
    { type: 'id',   value: `${YT_PKG}:id/current_time` },
  ],
  total_time: [
    { type: 'id',   value: `${YT_PKG}:id/total_time` },
  ],
  mute_button: [
    { type: 'id',   value: `${YT_PKG}:id/mute_button` },
  ],
  caption: [
    { type: 'id',   value: `${YT_PKG}:id/caption_button` },
  ],
  player_settings: [
    { type: 'id',   value: `${YT_PKG}:id/player_overflow_button` },
  ],
  fullscreen: [
    { type: 'id',   value: `${YT_PKG}:id/fullscreen_button` },
    { type: 'desc', value: '전체 화면' },
    { type: 'desc', value: 'Full screen' },
  ],
  autoplay_toggle: [
    { type: 'id',   value: `${YT_PKG}:id/autonav_toggle` },
  ],

  // ── 광고 ───────────────────────────────────────────────────
  skip_ad: [
    { type: 'id',   value: `${YT_PKG}:id/skip_ad_button` },
    { type: 'desc', value: '광고 건너뛰기' },
    { type: 'desc', value: 'Skip ad' },
  ],
  ad_countdown: [
    { type: 'id',   value: `${YT_PKG}:id/skip_ad_countdown` },
  ],
  ad_progress: [
    { type: 'id',   value: `${YT_PKG}:id/ad_progress_text` },
  ],
  ad_close: [
    { type: 'id',   value: `${YT_PKG}:id/ad_close_button` },
  ],

  // ── 영상 정보 ──────────────────────────────────────────────
  video_title: [
    { type: 'id',   value: `${YT_PKG}:id/video_title` },
  ],
  video_metadata: [
    { type: 'id',   value: `${YT_PKG}:id/video_metadata` },
  ],
  channel_name: [
    { type: 'id',   value: `${YT_PKG}:id/channel_name` },
  ],
  channel_avatar: [
    { type: 'id',   value: `${YT_PKG}:id/channel_avatar` },
  ],
  subscriber_count: [
    { type: 'id',   value: `${YT_PKG}:id/subscriber_count` },
  ],
  subscribe_button: [
    { type: 'id',   value: `${YT_PKG}:id/subscribe_button` },
    // desc "구독" 제거 → "구독 취소"와 충돌
  ],
  notification_bell: [
    { type: 'id',   value: `${YT_PKG}:id/notification_preference_button` },
  ],
  description_expand: [
    { type: 'id',   value: `${YT_PKG}:id/description_expand_button` },
  ],

  // ── 액션 버튼 바 ───────────────────────────────────────────
  like_button: [
    { type: 'id',   value: `${YT_PKG}:id/like_button` },
    // desc "좋아요" 제거 → 댓글 좋아요와 충돌
  ],
  like_count: [
    { type: 'id',   value: `${YT_PKG}:id/like_count` },
  ],
  dislike_button: [
    { type: 'id',   value: `${YT_PKG}:id/dislike_button` },
  ],
  share_button: [
    { type: 'id',   value: `${YT_PKG}:id/share_button` },
    { type: 'desc', value: '공유' },
    { type: 'desc', value: 'Share' },
  ],
  save_playlist: [
    { type: 'id',   value: `${YT_PKG}:id/save_to_playlist_button` },
    { type: 'desc', value: '재생목록에 저장' },
  ],
  clip_button: [
    { type: 'id',   value: `${YT_PKG}:id/clip_button` },
  ],
  overflow_button: [
    { type: 'id',   value: `${YT_PKG}:id/overflow_button` },
  ],

  // ── 댓글 ───────────────────────────────────────────────────
  comments_section: [
    { type: 'id',   value: `${YT_PKG}:id/comments_section` },
  ],
  comment_sort: [
    { type: 'id',   value: `${YT_PKG}:id/comments_sort_button` },
    { type: 'desc', value: '댓글 정렬' },
  ],
  comment_input: [
    { type: 'id',   value: `${YT_PKG}:id/comment_composer_input` },
    { type: 'desc', value: '댓글 추가...' },
  ],
  comment_submit: [
    { type: 'id',   value: `${YT_PKG}:id/comment_post_button` },
    // desc "댓글" 제거 → 섹션 헤더와 충돌
  ],
  comment_cancel: [
    { type: 'id',   value: `${YT_PKG}:id/comment_cancel_button` },
    // desc "취소" 제거 → 모든 취소 버튼에 매칭되는 버그
  ],
  comment_like: [
    { type: 'id',   value: `${YT_PKG}:id/comment_like_button` },
  ],
  comment_dislike: [
    { type: 'id',   value: `${YT_PKG}:id/comment_dislike_button` },
  ],
  comment_reply: [
    { type: 'id',   value: `${YT_PKG}:id/comment_reply_button` },
  ],
  comment_replies: [
    { type: 'id',   value: `${YT_PKG}:id/comment_replies_button` },
  ],
  comment_overflow: [
    { type: 'id',   value: `${YT_PKG}:id/comment_overflow_button` },
  ],

  // ── 연관 영상 / 사이드바 ────────────────────────────────────
  watch_next_feed: [
    { type: 'id',   value: `${YT_PKG}:id/watch_next_feed` },
  ],
  compact_video: [
    { type: 'id',   value: `${YT_PKG}:id/compact_video_renderer` },
  ],
  thumbnail: [
    { type: 'id',   value: `${YT_PKG}:id/thumbnail` },
  ],
  duration: [
    { type: 'id',   value: `${YT_PKG}:id/duration` },
  ],

  // ── 홈 피드 ────────────────────────────────────────────────
  home_feed: [
    { type: 'id',   value: `${YT_PKG}:id/results` },
  ],
  rich_item: [
    { type: 'id',   value: `${YT_PKG}:id/rich_item_renderer` },
  ],
  chip_cloud: [
    { type: 'id',   value: `${YT_PKG}:id/chip_cloud` },
  ],
  bottom_nav: [
    { type: 'id',   value: `${YT_PKG}:id/bottom_navigation_bar` },
  ],
  tab_home: [
    { type: 'id',   value: `${YT_PKG}:id/menu_item_home` },
  ],
  tab_shorts: [
    { type: 'id',   value: `${YT_PKG}:id/menu_item_shorts` },
  ],
  tab_subscriptions: [
    { type: 'id',   value: `${YT_PKG}:id/menu_item_subscriptions` },
  ],
  tab_library: [
    { type: 'id',   value: `${YT_PKG}:id/menu_item_library` },
  ],

  // ── 최근 앱 (closeAllWindows) ───────────────────────────────
  recents_clear_all: [
    { type: 'desc', value: '모두 닫기' },
    { type: 'desc', value: 'Clear all' },
    { type: 'text', value: '모두 닫기' },
    { type: 'text', value: '모두 지우기' },
    { type: 'text', value: 'Clear all' },
  ],
};

// ============================================================
// 2. 셀렉터 엔진 (FIX: sleep 추가로 CPU 스핀 제거)
// ============================================================
const SelectorEngine = {
  find(selectorList, timeout = 3000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const sel of selectorList) {
        let el = null;
        try {
          if (sel.type === 'id')    el = id(sel.value).findOne(80);
          if (sel.type === 'desc')  el = desc(sel.value).findOne(80);
          if (sel.type === 'text')  el = text(sel.value).findOne(80);
          if (sel.type === 'class') el = className(sel.value).findOne(80);
        } catch (e) {}
        if (el) return el;
      }
      sleep(150); // ← CPU 스핀 방지 핵심
    }
    return null;
  },

  findAll(selectorList, timeout = 3000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      for (const sel of selectorList) {
        let els = null;
        try {
          if (sel.type === 'id')   els = id(sel.value).find();
          if (sel.type === 'desc') els = desc(sel.value).find();
          if (sel.type === 'text') els = text(sel.value).find();
        } catch (e) {}
        if (els && els.length > 0) return els;
      }
      sleep(200);
    }
    return [];
  },

  exists(selectorList, timeout = 1500) {
    return this.find(selectorList, timeout) !== null;
  },
};

// ============================================================
// 3. 화면 컨텍스트 체커
// ============================================================
const ScreenContext = {
  isYouTubeForeground() {
    try { return currentPackage() === YT_PKG; } catch (e) { return false; }
  },
  isWatchPage() {
    return SelectorEngine.exists(SELECTORS.player, 1000);
  },
  isHomeFeed() {
    return id(`${YT_PKG}:id/results`).exists() ||
           id(`${YT_PKG}:id/rich_item_renderer`).exists() ||
           id(`${YT_PKG}:id/chip_cloud`).exists();
  },
  requireYouTube(action) {
    if (!this.isYouTubeForeground()) {
      return { success: false, action, error: 'YouTube is not in foreground' };
    }
    return null;
  },
  requireWatchPage(action) {
    const r = this.requireYouTube(action);
    if (r) return r;
    if (!this.isWatchPage()) {
      return { success: false, action, error: 'Not on watch page' };
    }
    return null;
  },
};

// ============================================================
// 4. 이벤트 검증기
// ============================================================
const EventValidator = {
  like() {
    sleep(700);
    const btn = SelectorEngine.find(SELECTORS.like_button, 1500);
    return btn ? btn.selected() : false;
  },
  subscribe() {
    sleep(1000);
    const btn = SelectorEngine.find(SELECTORS.subscribe_button, 1500);
    if (!btn) return false;
    const label = btn.text() || btn.contentDescription() || '';
    return label.includes('구독 중') || label.includes('Subscribed');
  },
  comment() {
    sleep(1500);
    const input = SelectorEngine.find(SELECTORS.comment_input, 1000);
    if (!input) return true; // 입력창이 닫혔으면 제출 성공
    const t = input.text();
    return !t || t === '';
  },
  isPlaying() {
    const btn = SelectorEngine.find(SELECTORS.play_pause, 1000);
    if (!btn) return false;
    return (btn.contentDescription() || '').includes('일시중지');
  },
};

// ============================================================
// 5. 유틸리티
// ============================================================
const Utils = {
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  randomSleep(min = 500, max = 2000) {
    sleep(this.randomInt(min, max));
  },
  swipeUp(distance = 700) {
    const cx = device.width / 2, cy = device.height / 2;
    swipe(cx, cy + distance / 2, cx, cy - distance / 2, 500);
    sleep(300);
  },
  swipeDown(distance = 600) {
    const cx = device.width / 2, cy = device.height / 2;
    swipe(cx, cy - distance / 2, cx, cy + distance / 2, 500);
    sleep(300);
  },
  log(msg, level = 'INFO') {
    console.log(`[${level}][YTCmd] ${msg}`);
  },
};

// ============================================================
// 6. 액션 핸들러
// ============================================================
const ActionHandlers = {

  // ─── 화면 초기화 ───────────────────────────────────────────

  closeAllWindows() {
    Utils.log('closeAllWindows: open recents');
    KeyEvent(187); // KEYCODE_APP_SWITCH
    sleep(1200);
    const clearBtn = SelectorEngine.find(SELECTORS.recents_clear_all, 4000);
    if (clearBtn) {
      clearBtn.click();
      sleep(800);
      Utils.log('closeAllWindows: cleared');
    } else {
      Utils.log('closeAllWindows: no apps to clear', 'WARN');
    }
    KeyEvent(3); // HOME
    sleep(800);
    return { success: true, action: 'closeAllWindows' };
  },

  launch({ pkg = YT_PKG, url = null, fromScratch = false } = {}) {
    if (fromScratch) ActionHandlers.closeAllWindows();

    if (url) {
      app.openUrl(url);
    } else {
      // app.launch(pkg) 는 마지막 Activity 상태(설정화면 등)를 복원할 수 있음
      // Intent로 MainActivity 직접 지정해서 항상 홈 피드로 진입
      app.startActivity({
        action:     'android.intent.action.MAIN',
        category:   'android.intent.category.LAUNCHER',
        packageName: pkg,
        className:  'com.google.android.youtube.app.honeycomb.Shell$HomeActivity',
        flags:      0x10000000 | 0x20000000, // FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_CLEAR_TASK
      });
    }

    // 포그라운드 대기 (최대 8초)
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (ScreenContext.isYouTubeForeground()) break;
      sleep(500);
    }
    Utils.randomSleep(1500, 2500);

    // 팝업/다이얼로그 자동 처리 후 홈 피드 진입 대기
    let escaped = false;
    for (let i = 0; i < 8; i++) {
      // 홈 피드 확인
      if (id(`${YT_PKG}:id/results`).exists() ||
          id(`${YT_PKG}:id/rich_item_renderer`).exists() ||
          id(`${YT_PKG}:id/chip_cloud`).exists()) {
        escaped = true;
        break;
      }

      // "피드에서 재생" 등 다이얼로그 → 취소 버튼(android:id/button2) 클릭
      const cancelBtn = id('android:id/button2').findOne(500);
      if (cancelBtn) {
        Utils.log(`launch: dismissing dialog [${id(`${YT_PKG}:id/alertTitle`).findOne(200)?.text() || '?'}]`, 'WARN');
        cancelBtn.click();
        sleep(900);
        continue;
      }

      // alertTitle만 있고 button2 없는 경우 → BACK
      if (id(`${YT_PKG}:id/alertTitle`).exists()) {
        Utils.log('launch: dismissing alert via BACK', 'WARN');
        KeyEvent(4);
        sleep(800);
        continue;
      }

      // 그 외 알 수 없는 화면 → BACK
      Utils.log('launch: unknown screen, pressing BACK', 'WARN');
      KeyEvent(4);
      sleep(800);
    }

    // 그래도 안 되면 Intent 재시도 (flags에 CLEAR_TOP 추가)
    if (!escaped) {
      Utils.log('launch: retry with CLEAR_TOP flag', 'WARN');
      app.startActivity({
        action:     'android.intent.action.MAIN',
        category:   'android.intent.category.LAUNCHER',
        packageName: pkg,
        className:  'com.google.android.youtube.app.honeycomb.Shell$HomeActivity',
        flags:      0x10000000 | 0x04000000, // NEW_TASK | CLEAR_TOP
      });
      sleep(3000);
    }

    return {
      success: ScreenContext.isYouTubeForeground(),
      action: 'launch',
      fromScratch,
      escaped,
    };
  },

  home() {
    KeyEvent(3); sleep(600);
    return { success: true, action: 'home' };
  },

  back() {
    KeyEvent(4); sleep(500);
    return { success: true, action: 'back' };
  },

  // ─── 검색 ──────────────────────────────────────────────────

  search({ query = '' } = {}) {
    if (!query) return { success: false, action: 'search', error: 'query required' };
    const err = ScreenContext.requireYouTube('search');
    if (err) return err;

    // ── Step 1: 검색 버튼 찾아서 클릭 ──────────────────────────
    let searchOpened = false;

    const searchBtn = SelectorEngine.find(SELECTORS.search_button, 3000);
    if (searchBtn) {
      searchBtn.click();
      Utils.randomSleep(700, 1200);
      searchOpened = true;
    } else {
      // 폴백 A: 우상단 영역 터치 (YouTube 검색 아이콘 고정 위치)
      Utils.log('search: button not found, tapping top-right area', 'WARN');
      const w = device.width;
      click(w - 120, 80); // 대략 우상단
      sleep(1000);
      // EditText가 나타났으면 성공
      if (SelectorEngine.exists(SELECTORS.search_bar, 1500)) {
        searchOpened = true;
      }
    }

    if (!searchOpened) {
      return { success: false, action: 'search', error: 'could not open search' };
    }

    // ── Step 2: 검색창 입력 ────────────────────────────────────
    let input = SelectorEngine.find(SELECTORS.search_bar, 4000);

    // 폴백 B: EditText가 여러 개 있을 수 있으니 전체 탐색
    if (!input) {
      const allEdits = className('android.widget.EditText').find();
      if (allEdits && allEdits.length > 0) input = allEdits[0];
    }

    if (!input) {
      return { success: false, action: 'search', error: 'search_bar not found' };
    }

    input.click();
    sleep(400);

    // setText가 안 먹는 경우 대비 — 클립보드 붙여넣기 방식 병행
    input.setText(query);
    sleep(300);

    // setText 후 내용 확인, 비어있으면 클립보드 방식 시도
    if (!input.text() || input.text().trim() === '') {
      Utils.log('search: setText failed, trying clipboard paste', 'WARN');
      setClip(query);
      sleep(200);
      input.click();
      sleep(200);
      // 붙여넣기 (CTRL+V 또는 롱프레스 메뉴)
      KeyEvent(279); // KEYCODE_PASTE
      sleep(300);
    }

    Utils.randomSleep(400, 700);
    KeyEvent(66); // ENTER
    Utils.randomSleep(1800, 2800);

    return { success: true, action: 'search', query };
  },

  /** 검색 결과 화면에서 첫 번째 영상 클릭 (Agent job_assignment용, ADB 충돌 제거) */
  open_first_result() {
    const thumb = SelectorEngine.find(SELECTORS.thumbnail, 5000);
    if (thumb) {
      thumb.click();
      Utils.randomSleep(1500, 2500);
      return { success: true, action: 'open_first_result', by: 'thumbnail' };
    }
    const title = SelectorEngine.find(SELECTORS.video_title, 3000);
    if (title) {
      title.click();
      Utils.randomSleep(1500, 2500);
      return { success: true, action: 'open_first_result', by: 'video_title' };
    }
    return { success: false, action: 'open_first_result', error: 'no result found' };
  },

  // ─── 재생 제어 ─────────────────────────────────────────────

  play() {
    const err = ScreenContext.requireWatchPage('play');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.play_pause);
    if (!btn) return { success: false, action: 'play', error: 'play_pause not found' };
    if ((btn.contentDescription() || '').includes('재생')) { btn.click(); sleep(500); }
    return { success: true, action: 'play', isPlaying: EventValidator.isPlaying() };
  },

  pause() {
    const err = ScreenContext.requireWatchPage('pause');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.play_pause);
    if (!btn) return { success: false, action: 'pause', error: 'play_pause not found' };
    if ((btn.contentDescription() || '').includes('일시중지')) { btn.click(); sleep(500); }
    return { success: true, action: 'pause' };
  },

  toggle_play() {
    const err = ScreenContext.requireWatchPage('toggle_play');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.play_pause);
    if (!btn) return { success: false, action: 'toggle_play', error: 'play_pause not found' };
    btn.click(); sleep(500);
    return { success: true, action: 'toggle_play', isPlaying: EventValidator.isPlaying() };
  },

  seek({ percent = 50 } = {}) {
    const err = ScreenContext.requireWatchPage('seek');
    if (err) return err;
    const bar = SelectorEngine.find(SELECTORS.seekbar);
    if (!bar) return { success: false, action: 'seek', error: 'seekbar not found' };
    const b = bar.bounds();
    click(b.left + Math.floor((b.right - b.left) * (percent / 100)), b.centerY());
    Utils.randomSleep(300, 600);
    return { success: true, action: 'seek', percent };
  },

  fullscreen() {
    const err = ScreenContext.requireWatchPage('fullscreen');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.fullscreen);
    if (!btn) return { success: false, action: 'fullscreen', error: 'fullscreen not found' };
    btn.click(); sleep(500);
    return { success: true, action: 'fullscreen' };
  },

  caption() {
    const err = ScreenContext.requireWatchPage('caption');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.caption);
    if (!btn) return { success: false, action: 'caption', error: 'caption not found' };
    btn.click(); sleep(300);
    return { success: true, action: 'caption' };
  },

  // ─── 광고 처리 ─────────────────────────────────────────────

  skip_ad({ maxWait = 15000 } = {}) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const btn = SelectorEngine.find(SELECTORS.skip_ad, 800);
      if (btn && btn.enabled()) {
        btn.click(); sleep(600);
        return { success: true, action: 'skip_ad', waited: Date.now() - start };
      }
      sleep(600);
    }
    return { success: false, action: 'skip_ad', error: 'timeout or no ad' };
  },

  wait_ad({ checkInterval = 1000 } = {}) {
    const maxWait = 60000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const skip = SelectorEngine.find(SELECTORS.skip_ad, 500);
      if (skip && skip.enabled()) {
        skip.click(); sleep(600);
        return { success: true, action: 'wait_ad', type: 'skipped', waited: Date.now() - start };
      }
      if (!SelectorEngine.exists(SELECTORS.ad_progress, 400)) {
        return { success: true, action: 'wait_ad', type: 'no_ad_or_ended' };
      }
      sleep(checkInterval);
    }
    return { success: false, action: 'wait_ad', error: 'timeout' };
  },

  // ─── 참여 ──────────────────────────────────────────────────

  like({ verify = true } = {}) {
    const err = ScreenContext.requireWatchPage('like');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.like_button, 3000);
    if (!btn) return { success: false, action: 'like', error: 'like_button not found' };
    if (btn.selected()) return { success: true, action: 'like', alreadyLiked: true };
    btn.click();
    const result = verify ? EventValidator.like() : true;
    return { success: result, action: 'like', selected: result };
  },

  unlike() {
    const err = ScreenContext.requireWatchPage('unlike');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.like_button, 3000);
    if (!btn) return { success: false, action: 'unlike', error: 'like_button not found' };
    if (btn.selected()) { btn.click(); sleep(500); }
    return { success: true, action: 'unlike' };
  },

  dislike() {
    const err = ScreenContext.requireWatchPage('dislike');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.dislike_button, 3000);
    if (!btn) return { success: false, action: 'dislike', error: 'dislike_button not found' };
    if (!btn.selected()) btn.click();
    return { success: true, action: 'dislike' };
  },

  subscribe({ notify = false } = {}) {
    const err = ScreenContext.requireWatchPage('subscribe');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.subscribe_button, 3000);
    if (!btn) return { success: false, action: 'subscribe', error: 'subscribe_button not found' };
    const label = btn.text() || btn.contentDescription() || '';
    if (label.includes('구독 중') || label.includes('Subscribed')) {
      return { success: true, action: 'subscribe', alreadySubscribed: true };
    }
    btn.click();
    const result = EventValidator.subscribe();
    if (notify && result) {
      Utils.randomSleep(500, 900);
      const bell = SelectorEngine.find(SELECTORS.notification_bell, 2000);
      if (bell) {
        bell.click(); Utils.randomSleep(300, 600);
        const allNotif = text('전체').findOne(2000);
        if (allNotif) allNotif.click();
      }
    }
    return { success: result, action: 'subscribe', subscribed: result };
  },

  unsubscribe() {
    const err = ScreenContext.requireWatchPage('unsubscribe');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.subscribe_button, 3000);
    if (!btn) return { success: false, action: 'unsubscribe', error: 'subscribe_button not found' };
    const label = btn.text() || btn.contentDescription() || '';
    if (label.includes('구독 중') || label.includes('Subscribed')) {
      btn.click(); sleep(600);
      const confirm = text('구독 취소').findOne(2000);
      if (confirm) confirm.click();
    }
    return { success: true, action: 'unsubscribe' };
  },

  share() {
    const err = ScreenContext.requireWatchPage('share');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.share_button, 3000);
    if (!btn) return { success: false, action: 'share', error: 'share_button not found' };
    btn.click(); Utils.randomSleep(800, 1400);
    return { success: true, action: 'share' };
  },

  save_to_playlist({ playlistName = null } = {}) {
    const err = ScreenContext.requireWatchPage('save_to_playlist');
    if (err) return err;
    const btn = SelectorEngine.find(SELECTORS.save_playlist, 3000);
    if (!btn) return { success: false, action: 'save_to_playlist', error: 'save_playlist not found' };
    btn.click(); Utils.randomSleep(700, 1100);
    if (playlistName) {
      const pl = text(playlistName).findOne(3000);
      if (pl) { pl.click(); sleep(500); }
    }
    return { success: true, action: 'save_to_playlist', playlistName };
  },

  // ─── 댓글 ──────────────────────────────────────────────────

  comment({ text: commentText = '', verify = true } = {}) {
    if (!commentText) return { success: false, action: 'comment', error: 'text required' };
    const err = ScreenContext.requireWatchPage('comment');
    if (err) return err;

    // 스크롤로 댓글창 노출
    let input = SelectorEngine.find(SELECTORS.comment_input, 1200);
    let tries = 0;
    while (!input && tries < 4) {
      Utils.swipeUp(500); Utils.randomSleep(500, 900);
      input = SelectorEngine.find(SELECTORS.comment_input, 1200);
      tries++;
    }
    if (!input) return { success: false, action: 'comment', error: 'comment_input not found' };

    input.click(); Utils.randomSleep(500, 800);
    input.setText(commentText); Utils.randomSleep(700, 1200);

    const submitBtn = SelectorEngine.find(SELECTORS.comment_submit, 3000);
    if (!submitBtn || !submitBtn.enabled()) {
      const cancel = SelectorEngine.find(SELECTORS.comment_cancel, 1000);
      if (cancel) cancel.click();
      return { success: false, action: 'comment', error: 'comment_submit not available' };
    }
    submitBtn.click();
    const result = verify ? EventValidator.comment() : true;
    return { success: result, action: 'comment', text: commentText };
  },

  comment_like({ index = 0 } = {}) {
    const btns = SelectorEngine.findAll(SELECTORS.comment_like, 3000);
    if (!btns || btns.length <= index) {
      return { success: false, action: 'comment_like', error: `index ${index} not found` };
    }
    btns[index].click(); sleep(500);
    return { success: true, action: 'comment_like', index };
  },

  comment_reply({ index = 0, text: replyText = '' } = {}) {
    if (!replyText) return { success: false, action: 'comment_reply', error: 'text required' };
    const btns = SelectorEngine.findAll(SELECTORS.comment_reply, 3000);
    if (!btns || btns.length <= index) {
      return { success: false, action: 'comment_reply', error: `index ${index} not found` };
    }
    btns[index].click(); Utils.randomSleep(500, 800);
    const input = SelectorEngine.find(SELECTORS.comment_input, 3000);
    if (!input) return { success: false, action: 'comment_reply', error: 'reply_input not found' };
    input.setText(replyText); Utils.randomSleep(500, 900);
    const submit = SelectorEngine.find(SELECTORS.comment_submit, 2000);
    if (submit && submit.enabled()) submit.click();
    sleep(1000);
    return { success: true, action: 'comment_reply', text: replyText };
  },

  comment_sort({ by = '인기' } = {}) {
    const btn = SelectorEngine.find(SELECTORS.comment_sort, 3000);
    if (!btn) return { success: false, action: 'comment_sort', error: 'not found' };
    btn.click(); Utils.randomSleep(400, 700);
    const label = by === '최신' ? '최신순' : '인기 댓글순';
    const option = text(label).findOne(2000);
    if (option) option.click();
    sleep(800);
    return { success: true, action: 'comment_sort', by };
  },

  // ─── 워밍업 ────────────────────────────────────────────────

  warmup({ mode = 'home', count = 3, watchDuration = [10000, 30000] } = {}) {
    const err = ScreenContext.requireYouTube('warmup');
    if (err) return err;

    const results = [];

    if (mode === 'home') {
      for (let i = 0; i < count; i++) {
        Utils.log(`Warmup[home] ${i + 1}/${count}`);
        Utils.swipeDown(400); Utils.randomSleep(500, 900);
        const thumbs = SelectorEngine.findAll(SELECTORS.thumbnail, 2000);
        if (thumbs && thumbs.length > 0) {
          thumbs[Utils.randomInt(0, Math.min(thumbs.length - 1, 5))].click();
          Utils.randomSleep(2000, 3000);
          ActionHandlers.wait_ad();
          const w = Utils.randomInt(watchDuration[0], watchDuration[1]);
          sleep(w);
          results.push({ index: i, mode: 'home', watched: w });
          KeyEvent(4); Utils.randomSleep(800, 1400);
        }
      }

    } else if (mode === 'sidebar') {
      const watchErr = ScreenContext.requireWatchPage('warmup.sidebar');
      if (watchErr) return watchErr;
      for (let i = 0; i < count; i++) {
        Utils.log(`Warmup[sidebar] ${i + 1}/${count}`);
        Utils.swipeUp(500); Utils.randomSleep(500, 900);
        const thumbs = SelectorEngine.findAll(SELECTORS.thumbnail, 2000);
        if (thumbs && thumbs.length > 1) {
          thumbs[Utils.randomInt(1, Math.min(thumbs.length - 1, 4))].click();
          Utils.randomSleep(2000, 3000);
          ActionHandlers.wait_ad();
          const w = Utils.randomInt(watchDuration[0], watchDuration[1]);
          sleep(w);
          results.push({ index: i, mode: 'sidebar', watched: w });
        }
      }

    } else if (mode === 'autoplay') {
      const toggle = SelectorEngine.find(SELECTORS.autoplay_toggle, 3000);
      if (toggle && !toggle.checked()) { toggle.click(); sleep(500); }
      const total = Utils.randomInt(watchDuration[0], watchDuration[1]) * count;
      sleep(total);
      results.push({ mode: 'autoplay', waited: total });

    } else if (mode === 'hashtag') {
      // FIX: descContains 제거 → 텍스트 기반으로 # 포함 링크 탐색
      const watchErr = ScreenContext.requireWatchPage('warmup.hashtag');
      if (watchErr) return watchErr;
      let tagClicked = false;
      const links = id(`${YT_PKG}:id/text`).find();
      if (links) {
        for (let i = 0; i < links.length && !tagClicked; i++) {
          const t = links[i].text() || '';
          if (t.startsWith('#')) {
            links[i].click(); Utils.randomSleep(1500, 2500);
            const w = Utils.randomInt(watchDuration[0], watchDuration[1]);
            sleep(w);
            results.push({ mode: 'hashtag', tag: t, watched: w });
            KeyEvent(4);
            tagClicked = true;
          }
        }
      }
      if (!tagClicked) {
        return { success: false, action: 'warmup', mode, error: 'no hashtag found' };
      }
    }

    return { success: true, action: 'warmup', mode, count, results };
  },

  // ─── 상태 조회 ─────────────────────────────────────────────

  get_state() {
    return {
      success: true,
      action: 'get_state',
      isYouTube: ScreenContext.isYouTubeForeground(),
      isWatchPage: ScreenContext.isWatchPage(),
      isPlaying: EventValidator.isPlaying(),
      hasAd: SelectorEngine.exists(SELECTORS.ad_progress, 400),
      canSkipAd: SelectorEngine.exists(SELECTORS.skip_ad, 400),
      isSubscribed: SelectorEngine.exists(SELECTORS.subscribe_button, 500)
        ? (() => {
            const b = SelectorEngine.find(SELECTORS.subscribe_button, 500);
            const l = b ? (b.text() || b.contentDescription() || '') : '';
            return l.includes('구독 중') || l.includes('Subscribed');
          })()
        : false,
      isLiked: (() => {
        const b = SelectorEngine.find(SELECTORS.like_button, 800);
        return b ? b.selected() : false;
      })(),
      videoTitle: (() => {
        const e = SelectorEngine.find(SELECTORS.video_title, 800);
        return e ? e.text() : null;
      })(),
      channelName: (() => {
        const e = SelectorEngine.find(SELECTORS.channel_name, 800);
        return e ? e.text() : null;
      })(),
    };
  },

  // ─── 복합 시나리오 ─────────────────────────────────────────

  full_engage({ watchMs = 20000, commentText = null, subscribe = false } = {}) {
    const steps = [];
    steps.push(ActionHandlers.wait_ad());
    sleep(watchMs);
    steps.push({ action: 'watch', duration: watchMs });
    steps.push(ActionHandlers.like());
    if (commentText) {
      Utils.swipeUp(500); Utils.randomSleep(400, 800);
      steps.push(ActionHandlers.comment({ text: commentText }));
    }
    if (subscribe) steps.push(ActionHandlers.subscribe());
    return { success: true, action: 'full_engage', steps };
  },
};

// ============================================================
// 7. 메인 디스패처
// ============================================================
const YouTubeCommander = {
  execute(cmd) {
    if (!cmd || !cmd.action) return { success: false, error: 'action is required' };
    const handler = ActionHandlers[cmd.action];
    if (!handler) {
      return { success: false, error: `unknown action: ${cmd.action}`, available: Object.keys(ActionHandlers) };
    }
    Utils.log(`Execute: ${cmd.action} params=${JSON.stringify(cmd.params || {})}`);
    try {
      return handler.call(ActionHandlers, cmd.params || {});
    } catch (e) {
      Utils.log(`Error[${cmd.action}]: ${e.message}`, 'ERROR');
      return { success: false, action: cmd.action, error: e.message };
    }
  },

  pipeline(commands, stepDelay = 500) {
    if (!Array.isArray(commands)) return { success: false, error: 'commands must be array' };
    const steps = [];
    for (const cmd of commands) {
      const result = this.execute(cmd);
      steps.push(result);
      Utils.log(`Pipeline[${cmd.action}]: ${result.success ? 'OK' : 'FAIL - ' + result.error}`);
      if (!result.success && cmd.failStop) {
        Utils.log(`Pipeline stopped at: ${cmd.action}`, 'WARN');
        break;
      }
      if (stepDelay > 0) sleep(stepDelay);
    }
    return { success: true, action: 'pipeline', steps };
  },

  listActions() {
    return Object.keys(ActionHandlers);
  },
};

// ============================================================
// 8. 진입점
//    우선순위: cmd.json 파일 → execArgv → get_state
//
//    autojsCreate로 실행될 때:
//      Node Agent가 /sdcard/scripts/cmd.json 을 먼저 업로드
//      → 이 스크립트가 읽어서 실행 → 결과를 result.json으로 저장
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = YouTubeCommander;
} else {
  try {
    // 0. 화면 세로 고정 (가로 자동전환 방지)
    try {
      device.setScreenOrientation(0);
    } catch(e) {}

    const CMD_PATH    = '/sdcard/scripts/cmd.json';
    const RESULT_PATH = '/sdcard/scripts/result.json';

    let result = null;

    // 1. cmd.json 우선 읽기 (autojsCreate 방식)
    let cmdJson = null;
    try {
      if (files.exists(CMD_PATH)) {
        cmdJson = JSON.parse(files.read(CMD_PATH));
      }
    } catch(e) {
      Utils.log(`cmd.json parse error: ${e.message}`, 'ERROR');
    }

    if (cmdJson) {
      Utils.log(`cmd.json found: ${JSON.stringify(cmdJson)}`);
      if (cmdJson.commands) {
        result = YouTubeCommander.pipeline(cmdJson.commands, cmdJson.stepDelay || 500);
      } else if (cmdJson.action) {
        result = YouTubeCommander.execute(cmdJson);
      } else {
        result = { success: false, error: 'cmd.json: action or commands required' };
      }

      // 결과를 result.json으로 저장 (Node Agent가 polling해서 수집)
      try {
        files.write(RESULT_PATH, JSON.stringify({
          ...result,
          timestamp: new Date().toISOString(),
          cmd: cmdJson,
        }));
      } catch(e) {}

      // 실행된 cmd.json 삭제 (다음 실행과 혼동 방지)
      try { files.remove(CMD_PATH); } catch(e) {}

    } else {
      // 2. execArgv 폴백 (직접 실행 시)
      const argv = engines.myEngine().execArgv;
      if (argv && argv.command) {
        result = YouTubeCommander.execute(argv.command);
      } else if (argv && argv.commands) {
        result = YouTubeCommander.pipeline(argv.commands, argv.stepDelay || 500);
      } else {
        // 3. 기본: 상태 조회
        result = YouTubeCommander.execute({ action: 'get_state' });
      }
    }

    Utils.log(`Result: ${JSON.stringify(result)}`);

  } catch (e) {
    Utils.log(`Entry error: ${e.message}`, 'ERROR');
  }
}

