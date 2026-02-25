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
// agent/.env 로드 (OPENAI_API_KEY, YOUTUBE_API_KEY)
try { require('dotenv').config({ path: require('path').join(__dirname, '..', 'agent', '.env') }); } catch {}

const WebSocket = require('ws');
const YTPlayer = require('../agent/yt-player');
const YTActions = require('../agent/yt-actions');
const CommentGenerator = require('../agent/comment-generator');

const SERIAL = process.env.SERIAL || '423349535a583098';
const XIAOWEI_URL = process.env.XIAOWEI_URL || 'ws://127.0.0.1:22222/';
const SEARCH_KEYWORD = process.env.SEARCH_KEYWORD || '총성 방화 멕시코 신흥 마약왕 사살 후 대혼란 범죄카르텔 보복 테러 연합뉴스TV';
const WATCH_SEC = parseInt(process.env.WATCH_SEC || '60', 10);
const FALLBACK_COMMENT = process.env.COMMENT || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const probs = {
  like: parseInt(process.env.PROB_LIKE || '100', 10),
  comment: parseInt(process.env.PROB_COMMENT || '100', 10),
  subscribe: parseInt(process.env.PROB_SUBSCRIBE || '100', 10),
  playlist: parseInt(process.env.PROB_PLAYLIST || '100', 10),
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

  // 1. 영상 시작 (검색 → 선택 → 광고 → 영상 검증)
  console.log('── 1. 영상 시작 ──');
  const { playing, adsSkipped, videoInfo, verification } = await player.startVideo(SERIAL, SEARCH_KEYWORD);
  console.log(`   재생: ${playing ? '✓' : '⚠'} | 광고: ${adsSkipped}개 건너뜀`);

  // 2. 영상 검증 결과
  console.log('── 2. 영상 검증 ──');
  console.log(`   제목: "${videoInfo.title || '(추출 실패)'}" [소스: ${videoInfo.source || 'none'}]`);
  console.log(`   채널: "${videoInfo.channel || '(추출 실패)'}"`);
  if (videoInfo.videoId) console.log(`   ID:   ${videoInfo.videoId}`);
  if (videoInfo.description) console.log(`   설명: "${videoInfo.description.substring(0, 50)}..."`);
  console.log(`   매칭: ${verification.matched ? '✓' : '✗'} ${verification.score}% (${verification.details})\n`);

  // 3. 액션 계획 (테스트 모드: 4개 전부 강제 실행)
  console.log('── 3. 액션 계획 (전체 강제 실행) ──');
  const plan = {
    willLike: true,
    willComment: true,
    willSubscribe: true,
    willPlaylist: true,
    likeAt:      WATCH_SEC * 0.20,
    commentAt:   WATCH_SEC * 0.40,
    subscribeAt: WATCH_SEC * 0.60,
    playlistAt:  WATCH_SEC * 0.80,
  };

  // 댓글 생성 (GPT or 폴백)
  let commentText = null;
  if (plan.willComment) {
    if (OPENAI_API_KEY) {
      console.log('   댓글 생성: OpenAI API 호출 중...');
      const gen = new CommentGenerator(OPENAI_API_KEY);
      commentText = await gen.generate(
        videoInfo.title || SEARCH_KEYWORD,
        videoInfo.channel || ''
      );
      if (commentText) {
        console.log(`   GPT 댓글: "${commentText}"`);
      } else {
        console.log('   GPT 생성 실패 → 폴백 댓글 사용');
        commentText = FALLBACK_COMMENT || null;
      }
    } else {
      console.log('   OPENAI_API_KEY 없음 → 폴백 댓글 사용');
      commentText = FALLBACK_COMMENT || null;
    }
  }

  console.log(`   계획: 좋아요 → ${Math.round(plan.likeAt)}s, 댓글 → ${Math.round(plan.commentAt)}s, 구독 → ${Math.round(plan.subscribeAt)}s, 저장 → ${Math.round(plan.playlistAt)}s`);
  if (commentText) console.log(`   댓글: "${commentText}"`);
  console.log();

  // 4. 시청 + 액션 실행
  console.log('── 4. 시청 + 액션 ──');
  const result = await actions.executeWatchLoop(SERIAL, WATCH_SEC, plan, commentText);

  // 5. 종료
  console.log('\n── 5. 종료 ──');
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
