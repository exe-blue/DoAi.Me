/**
 * agent/youtube/search.js — YouTube 영상 검색 + 선택
 *
 * 검색 방법: YouTube 검색 결과 URL을 intent로 열기 (한글 입력 우회).
 * 검색 결과에서 광고 감지 → 스크롤/바로 탭으로 영상 선택.
 */
const { getLogger } = require('../common/logger');
const { dumpUI } = require('../adb/screen');
const { sleep, randInt, humanDelay, pctToAbs } = require('../adb/helpers');
const { COORDS, YT_PACKAGE } = require('./selectors');

const log = getLogger('youtube.search');

/**
 * YouTube 검색 결과 URL로 열기
 * @param {import('../adb/client').ADBDevice} dev
 * @param {string} keyword - 검색어 (한글 OK)
 */
async function openSearchResults(dev, keyword) {
  await dev.closeYouTube();
  await sleep(1000);

  const encoded = encodeURIComponent(keyword);
  const url = `https://www.youtube.com/results?search_query=${encoded}`;
  await dev.shell(`am start -a android.intent.action.VIEW -d '${url}'`);

  log.info('search_opened', { keyword });
  await sleep(randInt(4000, 6000));
}

/**
 * 검색 결과에서 첫 번째 영상 선택 (광고면 스크롤)
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<{selected: boolean, hadAd: boolean}>}
 */
async function selectFromResults(dev) {
  const scr = await dev.getScreenSize();
  const midX = Math.round(scr.width / 2);

  // 광고 여부 확인
  const ui = await dumpUI(dev);
  const hadAd = ui.contains('광고') || ui.contains('Ad ·') || ui.contains('Sponsored');

  if (hadAd) {
    log.info('search_ad_detected', { action: 'scroll_past' });
    const fromY = Math.round(scr.height * 0.75);
    const toY = Math.round(scr.height * 0.25);
    await dev.swipe(midX, fromY, midX, toY, 400);
    await sleep(2000);
  }

  // 첫 번째 결과 탭 (화면 35% 위치)
  const tapY = Math.round(scr.height * COORDS.FIRST_RESULT.yPct / 100);
  log.info('search_select', { x: midX, y: tapY, hadAd });
  await dev.tap(midX, tapY);
  await sleep(randInt(4000, 6000));

  return { selected: true, hadAd };
}

/**
 * 검색 결과에서 영상 정보 추출 (제목 목록)
 * @param {import('../adb/client').ADBDevice} dev
 * @returns {Promise<string[]>} 제목 후보 목록
 */
async function extractSearchResults(dev) {
  const ui = await dumpUI(dev);
  const exclude = ['구독', '좋아요', '댓글', '공유', '검색', '홈', 'Shorts', '설정', '탐색', '전체', '라이브'];
  return ui.findLongTexts(10, exclude);
}

/**
 * 전체 검색 플로우: 검색 → 광고 감지 → 영상 선택
 * @param {import('../adb/client').ADBDevice} dev
 * @param {string} keyword
 * @returns {Promise<{selected: boolean, hadAd: boolean, searchResults: string[]}>}
 */
async function searchAndSelect(dev, keyword) {
  log.info('search_start', { keyword });

  await openSearchResults(dev, keyword);
  const searchResults = await extractSearchResults(dev);
  const result = await selectFromResults(dev);

  log.info('search_done', {
    keyword,
    selected: result.selected,
    hadAd: result.hadAd,
    resultCount: searchResults.length,
    topResult: searchResults[0] || '(none)',
  });

  return { ...result, searchResults };
}

module.exports = { openSearchResults, selectFromResults, extractSearchResults, searchAndSelect };
