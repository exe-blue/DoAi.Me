/**
 * test_full_flow.js — 전체 플로우 테스트 (모듈 통합)
 *
 * YTPlayer (재생) + YTActions (좋아요/구독/댓글/저장)
 *
 * 사용법:
 *   node scripts/test_full_flow.js
 *   SEARCH_KEYWORD="검색어" WATCH_SEC=60 node scripts/test_full_flow.js
 *
 * 환경변수:
 *   SERIAL          디바이스 시리얼 (기본: 423349535a583098)
 *   XIAOWEI_URL     Xiaowei WebSocket URL
 *   SEARCH_KEYWORD  검색어
 *   WATCH_SEC       시청 시간 (기본: 30)
 *   PROB_LIKE       좋아요 확률 0~100 (기본: 100 = 테스트용)
 *   PROB_COMMENT    댓글 확률 (기본: 0)
 *   PROB_SUBSCRIBE  구독 확률 (기본: 0)
 *   PROB_PLAYLIST   저장 확률 (기본: 0)
 *   COMMENT         댓글 내용 (기본: 좋은 영상이네요)
 */
const WebSocket = require('ws');
const YTPlayer = require('../agent/yt-player');
const YTActions = require('../agent/yt-actions');

const SERIAL = process.env.SERIAL || '423349535a583098';
const XIAOWEI_URL = process.env.XIAOWEI_URL || 'ws://127.0.0.1:22222/';
const SEARCH_KEYWORD = process.env.SEARCH_KEYWORD || '마약왕 사살에 피의 복수 멕시코 카르텔 테러 확산 JTBC 뉴스룸';
const WATCH_SEC = parseInt(process.env.WATCH_SEC || '30', 10);
const COMMENT = process.env.COMMENT || '좋은 영상이네요 👍';

const probs = {
  like: parseInt(process.env.PROB_LIKE || '100', 10),
  comment: parseInt(process.env.PROB_COMMENT || '0', 10),
  subscribe: parseInt(process.env.PROB_SUBSCRIBE || '0', 10),
  playlist: parseInt(process.env.PROB_PLAYLIST || '0', 10),
};

// Xiaowei WebSocket wrapper (FIFO response matching)
const pendingQueue = [];

function createXiaoweiProxy(ws) {
  return {
    connected: true,
    adbShell(devices, command) {
      return new Promise((resolve, reject) => {
        const msg = JSON.stringify({ action: 'adb_shell', devices, data: { command } });
        const timeout = setTimeout(() => {
          const idx = pendingQueue.findIndex(p => p.msg === msg);
          if (idx !== -1) pendingQueue.splice(idx, 1);
          reject(new Error(`Timeout: adb_shell`));
        }, 15000);
        pendingQueue.push({ msg, resolve, reject, timeout });
        ws.send(msg);
      });
    },
    goHome(serial) {
      return this.adbShell(serial, 'input keyevent KEYCODE_HOME');
    },
  };
}

async function main() {
  console.log('═'.repeat(60));
  console.log(`  YouTube 전체 플로우 테스트 (모듈 통합)`);
  console.log(`  Device: ${SERIAL} | Search: "${SEARCH_KEYWORD}"`);
  console.log(`  Watch: ${WATCH_SEC}s | Like: ${probs.like}% Comment: ${probs.comment}%`);
  console.log('═'.repeat(60));

  // WebSocket 연결
  const ws = new WebSocket(XIAOWEI_URL);
  ws.on('message', (raw) => {
    try {
      const resp = JSON.parse(raw.toString());
      if (pendingQueue.length > 0) {
        const e = pendingQueue.shift();
        clearTimeout(e.timeout);
        e.resolve(resp);
      }
    } catch {}
  });
  ws.on('error', (err) => { console.error(`WS 에러: ${err.message}`); process.exit(1); });
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('close', () => reject(new Error('연결 실패')));
  });
  console.log('[연결] ✓ Xiaowei 연결\n');

  // 모듈 초기화
  const xiaowei = createXiaoweiProxy(ws);
  const player = new YTPlayer(xiaowei);
  const actions = new YTActions(player);

  // 1. 영상 시작
  console.log('── 1. 영상 시작 ──');
  const { playing, adsSkipped } = await player.startVideo(SERIAL, SEARCH_KEYWORD);
  console.log(`   재생: ${playing ? '✓' : '⚠'} | 광고: ${adsSkipped}개 건너뜀\n`);

  // 2. 액션 계획
  console.log('── 2. 액션 계획 ──');
  const plan = actions.planActions(WATCH_SEC, probs, SERIAL);
  const commentText = plan.willComment ? COMMENT : null;
  console.log(`   성격: ${actions.getPersonality(SERIAL)}`);
  console.log(`   계획: like=${plan.willLike} (at ${Math.round(plan.likeAt)}s)`);
  console.log(`         comment=${plan.willComment} (at ${Math.round(plan.commentAt)}s)`);
  console.log(`         subscribe=${plan.willSubscribe} (at ${Math.round(plan.subscribeAt)}s)`);
  console.log(`         playlist=${plan.willPlaylist} (at ${Math.round(plan.playlistAt)}s)\n`);

  // 3. 시청 + 액션 실행
  console.log('── 3. 시청 + 액션 ──');
  const result = await actions.executeWatchLoop(SERIAL, WATCH_SEC, plan, commentText);

  // 4. 종료
  console.log('\n── 4. 종료 ──');
  await player.goHome(SERIAL);
  console.log('   ✓ 홈으로 이동');

  console.log('\n' + '═'.repeat(60));
  console.log('  결과:');
  console.log(`    좋아요:    ${result.liked ? '✓' : '—'}`);
  console.log(`    댓글:      ${result.commented ? '✓' : '—'}`);
  console.log(`    구독:      ${result.subscribed ? '✓' : '—'}`);
  console.log(`    저장:      ${result.playlisted ? '✓' : '—'}`);
  console.log('═'.repeat(60));

  ws.close();
  setTimeout(() => process.exit(0), 500);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
