/**
 * agent/youtube/selectors.js — YouTube 앱 XML 셀렉터 중앙 관리
 *
 * 모든 resource-id, content-desc, text 매핑을 여기서 관리.
 * 앱 버전 변경 시 이 파일만 수정하면 됨.
 *
 * Galaxy S9 1080×1920 기준, 고정 좌표는 비율(%)로 정의.
 */

/** resource-id 셀렉터 */
const RES = {
  // 홈
  LOGO:              'com.google.android.youtube:id/logo',
  SEARCH_BUTTON:     'com.google.android.youtube:id/menu_search',
  SEARCH_EDIT:       'com.google.android.youtube:id/search_edit_text',
  SEARCH_GO:         'com.google.android.youtube:id/search_go_button',
  ACCOUNT_SWITCHER:  'com.google.android.youtube:id/account_switcher',

  // 플레이어
  PLAYER_VIEW:       'com.google.android.youtube:id/player_view',
  PLAY_PAUSE:        'com.google.android.youtube:id/player_play_pause_button',
  MUTE:              'com.google.android.youtube:id/player_mute_button',
  CAPTIONS:          'com.google.android.youtube:id/player_captions_button',
  SEEKBAR:           'com.google.android.youtube:id/time_bar',
  FULLSCREEN:        'com.google.android.youtube:id/fullscreen_button',
  OVERFLOW:          'com.google.android.youtube:id/player_overflow_button',

  // 영상 정보
  TITLE:             'com.google.android.youtube:id/title',
  VIDEO_TITLE:       'com.google.android.youtube:id/video_title',
  WATCH_TITLE:       'com.google.android.youtube:id/watch_video_title',
  CHANNEL_NAME:      'com.google.android.youtube:id/channel_name',
  OWNER_TEXT:        'com.google.android.youtube:id/owner_text',
  DESCRIPTION:       'com.google.android.youtube:id/video_description',

  // 액션 버튼
  SUBSCRIBE:         'com.google.android.youtube:id/subscribe_button',
  LIKE:              'com.google.android.youtube:id/like_button',
  DISLIKE:           'com.google.android.youtube:id/dislike_button',
  SHARE:             'com.google.android.youtube:id/share_button',
  SAVE_PLAYLIST:     'com.google.android.youtube:id/save_to_playlist_button',
  SAVE_MENU:         'com.google.android.youtube:id/menu_item_save_to_playlist',

  // 댓글
  COMMENT_ENTRY:     'com.google.android.youtube:id/comments_entry_point_header',
  COMMENT_INPUT:     'com.google.android.youtube:id/comment_composer_input',
  COMMENT_SUBMIT:    'com.google.android.youtube:id/comment_composer_submit_button',

  // 광고
  SKIP_AD:           'com.google.android.youtube:id/skip_ad_button',
  AD_BADGE:          'com.google.android.youtube:id/ad_badge',
  AD_PROGRESS:       'com.google.android.youtube:id/ad_progress_text',
  AD_INFO:           'com.google.android.youtube:id/ad_info_button',
  AD_CTA:            'com.google.android.youtube:id/ad_cta_button',

  // 하단 탭
  TAB_HOME:          'com.google.android.youtube:id/pivot_home',
  TAB_SHORTS:        'com.google.android.youtube:id/pivot_shorts',
  TAB_SUBSCRIPTIONS: 'com.google.android.youtube:id/pivot_subscriptions',
  TAB_LIBRARY:       'com.google.android.youtube:id/pivot_library',

  // Shorts
  LIKE_SHORTS:       'com.google.android.youtube:id/reel_like_button',
};

/** 고정 좌표 비율 (%) — XML에서 못 찾을 때 폴백용 */
const COORDS = {
  SEARCH_BUTTON:   { xPct: 87, yPct: 5 },
  LIKE:            { xPct: 48, yPct: 52 },
  SUBSCRIBE:       { xPct: 23, yPct: 52 },
  AD_SKIP:         { xPct: 85, yPct: 20 },
  COMMENT_FIELD:   { xPct: 26, yPct: 67 },
  COMMENT_SUBMIT:  { xPct: 93, yPct: 74 },
  PLAYER_CENTER:   { xPct: 50, yPct: 18 },
  FIRST_RESULT:    { xPct: 50, yPct: 35 },
};

/** 광고 감지 키워드 */
const AD_SIGNALS = ['skip_ad_button', 'ad_badge', 'ad_progress_text', 'ad_info_button', 'ad_cta_button', '광고', '스폰서', 'Sponsored'];

/** 광고 건너뛰기 키워드 */
const AD_SKIP_KEYWORDS = ['skip_ad_button', 'skip_ad', '건너뛰기', '광고 건너뛰기', 'Skip ad', 'Skip Ad'];

/** 버튼 행 UI (좋아요/공유/저장 등이 있는 y 위치) */
const ACTION_ROW_Y_PCT = 52;

/** YouTube 패키지명 */
const YT_PACKAGE = 'com.google.android.youtube';

module.exports = { RES, COORDS, AD_SIGNALS, AD_SKIP_KEYWORDS, ACTION_ROW_Y_PCT, YT_PACKAGE };
