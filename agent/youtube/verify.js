/**
 * agent/youtube/verify.js — 영상 정보 추출 + 검색어 매칭 검증
 *
 * video_id 추출 (URL), 제목/채널 추출 (XML → YouTube API 폴백).
 */
const { getLogger } = require('../common/logger');
const { dumpUI } = require('../adb/screen');
const { RES } = require('./selectors');

const log = getLogger('youtube.verify');

/**
 * 현재 재생 중인 영상 정보 수집 (다단계 폴백)
 * @param {import('../adb/client').ADBDevice} dev
 * @param {string} [searchKeyword] - 폴백용
 * @returns {Promise<{videoId, title, channel, description, source}>}
 */
async function getVideoInfo(dev, searchKeyword) {
  const info = { videoId: '', title: '', channel: '', description: '', source: '' };

  // 1. video_id: dumpsys URL에서 추출
  info.videoId = await _extractVideoId(dev);

  // 2. XML에서 제목/채널
  const ui = await dumpUI(dev);
  if (!ui.isEmpty) {
    for (const resId of [RES.TITLE, RES.VIDEO_TITLE, RES.WATCH_TITLE]) {
      const node = ui.findByResourceId(resId);
      if (node && node.text) { info.title = node.text; info.source = `xml:${resId.split('/').pop()}`; break; }
    }

    if (!info.title) {
      const longTexts = ui.findLongTexts(10, ['구독', '좋아요', '댓글', '공유', '저장', '검색', '홈']);
      if (longTexts.length > 0) { info.title = longTexts[0]; info.source = 'xml:textview_scan'; }
    }

    for (const resId of [RES.CHANNEL_NAME, RES.OWNER_TEXT]) {
      const node = ui.findByResourceId(resId);
      if (node && node.text) { info.channel = node.text; break; }
    }
  }

  // 3. YouTube Data API 폴백
  if (!info.title && info.videoId) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      const apiInfo = await _fetchFromAPI(info.videoId, apiKey);
      if (apiInfo.title) { info.title = apiInfo.title; info.source = 'youtube_api'; }
      if (apiInfo.channel && !info.channel) info.channel = apiInfo.channel;
    }
  }

  // 4. 검색 키워드 폴백
  if (!info.title && searchKeyword) {
    info.title = searchKeyword;
    info.source = 'search_keyword_fallback';
  }

  log.info('video_info', {
    title: info.title || '(none)',
    channel: info.channel || '(none)',
    videoId: info.videoId || '(none)',
    source: info.source,
  });

  return info;
}

/**
 * 검색 키워드 vs 실제 제목 매칭 검증
 * @param {string} keyword
 * @param {object} videoInfo
 * @returns {{matched: boolean, score: number, details: string}}
 */
function verifyVideoMatch(keyword, videoInfo) {
  if (!videoInfo.title) return { matched: false, score: 0, details: 'title_not_found' };

  const titleLower = videoInfo.title.toLowerCase();
  const words = keyword.replace(/[[\](){}|/\\.,!?~'"]/g, ' ').split(/\s+/).filter(w => w.length >= 2);

  let matchCount = 0;
  for (const w of words) {
    if (titleLower.includes(w.toLowerCase())) matchCount++;
  }

  const score = words.length > 0 ? Math.round((matchCount / words.length) * 100) : 0;
  const matched = score >= 30;

  log.info('verify_match', {
    matched,
    score,
    matchCount,
    totalWords: words.length,
    title: videoInfo.title.substring(0, 50),
  });

  return { matched, score, details: `${matchCount}/${words.length} keywords` };
}

/** @private video_id 추출: dumpsys URL */
async function _extractVideoId(dev) {
  try {
    const out = await dev.shell('dumpsys activity activities | grep -E "youtube.com/watch|youtu.be"');
    const vMatch = out.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vMatch) return vMatch[1];
    const shortMatch = out.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
  } catch {}
  return '';
}

/** @private YouTube Data API */
async function _fetchFromAPI(videoId, apiKey) {
  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    const data = await res.json();
    const snippet = data.items?.[0]?.snippet;
    if (snippet) return { title: snippet.title, channel: snippet.channelTitle };
  } catch {}
  return {};
}

module.exports = { getVideoInfo, verifyVideoMatch };
