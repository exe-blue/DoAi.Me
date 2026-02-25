/**
 * test_engagement.js — YouTube 좋아요 + 댓글 자동화 테스트
 *
 * 영상 검색 → 시청 10초 → 좋아요 → 댓글 작성 → 홈
 *
 * 사용법:
 *   node scripts/test_engagement.js
 *   SEARCH_KEYWORD="검색어" COMMENT="좋은 영상!" node scripts/test_engagement.js
 */
const WebSocket = require('ws');

const SERIAL = process.env.SERIAL || '423349535a583098';
const XIAOWEI_URL = process.env.XIAOWEI_URL || 'ws://127.0.0.1:22222/';
const SEARCH_KEYWORD = process.env.SEARCH_KEYWORD || '마약왕 사살에 피의 복수 멕시코 카르텔 테러 확산 JTBC 뉴스룸';
const COMMENT_TEXT = process.env.COMMENT || '좋은 영상이네요 👍';
const DO_LIKE = (process.env.DO_LIKE || 'true') !== 'false';
const DO_COMMENT = (process.env.DO_COMMENT || 'true') !== 'false';

let ws;
const pendingQueue = [];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function send(action, devices, data) {
  return new Promise((resolve, reject) => {
    const msg = JSON.stringify({ action, devices, data });
    const timeout = setTimeout(() => {
      const idx = pendingQueue.findIndex(p => p.msg === msg);
      if (idx !== -1) pendingQueue.splice(idx, 1);
      reject(new Error(`Timeout: ${action}`));
    }, 15000);
    pendingQueue.push({ msg, resolve, reject, timeout });
    ws.send(msg);
  });
}

function adb(command) { return send('adb_shell', SERIAL, { command }); }

function log(step, msg) {
  console.log(`[${new Date().toLocaleTimeString('ko-KR')}] [${step}] ${msg}`);
}

function out(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
    const v = Object.values(res.data);
    if (v.length > 0 && typeof v[0] === 'string') return v[0];
  }
  if (res.data != null) return String(res.data);
  if (res.msg != null) return String(res.msg);
  return JSON.stringify(res);
}

async function getScreen() {
  try {
    const res = await adb('wm size');
    const m = out(res).match(/(\d+)x(\d+)/);
    if (m) { const w = parseInt(m[1]), h = parseInt(m[2]); return { w, h, landscape: w > h }; }
  } catch {}
  return { w: 1080, h: 1920, landscape: false };
}

async function dumpUI() {
  try {
    await adb('uiautomator dump /sdcard/ui.xml');
    await sleep(800);
    const res = await adb('cat /sdcard/ui.xml');
    return out(res);
  } catch { return ''; }
}

async function findElement(pattern) {
  const xml = await dumpUI();
  if (!xml) return null;
  const re = new RegExp(pattern + '[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"', 'i');
  let match = xml.match(re);
  if (!match) {
    const re2 = new RegExp('bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*' + pattern, 'i');
    match = xml.match(re2);
  }
  if (match) {
    return { x: Math.round((parseInt(match[1]) + parseInt(match[3])) / 2),
             y: Math.round((parseInt(match[2]) + parseInt(match[4])) / 2) };
  }
  return null;
}

async function findAllMatches(pattern) {
  const xml = await dumpUI();
  if (!xml) return [];
  const results = [];
  const re = new RegExp(pattern + '[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"', 'gi');
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push({ x: Math.round((parseInt(m[1]) + parseInt(m[3])) / 2),
                   y: Math.round((parseInt(m[2]) + parseInt(m[4])) / 2) });
  }
  return results;
}

/** 광고 건너뛰기 (전략 1: XML bounds, 전략 2: 고정 좌표 946,1646) */
async function trySkipAd() {
  const xml = await dumpUI();
  if (xml) {
    const skipKeywords = ['skip_ad_button', 'skip_ad', '건너뛰기', '광고 건너뛰기', 'Skip ad', 'Skip Ad'];
    for (const kw of skipKeywords) {
      if (!xml.includes(kw)) continue;
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const nodeRe = new RegExp('<node[^>]*' + escaped + '[^>]*>', 'i');
      const nodeMatch = xml.match(nodeRe);
      if (nodeMatch) {
        const boundsMatch = nodeMatch[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (boundsMatch) {
          const cx = Math.round((parseInt(boundsMatch[1]) + parseInt(boundsMatch[3])) / 2);
          const cy = Math.round((parseInt(boundsMatch[2]) + parseInt(boundsMatch[4])) / 2);
          log('광고', `"${kw}" XML 노드에서 발견 → 탭 (${cx}, ${cy})`);
          await adb(`input tap ${cx} ${cy}`);
          return true;
        }
      }
    }
    const adSignals = ['ad_badge', 'ad_progress_text', 'ad_info_button', 'ad_cta_button', '광고'];
    for (const sig of adSignals) {
      if (xml.includes(sig)) {
        log('광고', `광고 신호 "${sig}" 감지 → 고정 좌표 탭`);
        return await skipAdFixedCoord();
      }
    }
  }
  return false;
}

async function skipAdFixedCoord() {
  const scr = await getScreen();
  // 위치 A: 플레이어 내부 우하단
  const ax = Math.round(scr.w * 0.876);
  const ay = Math.round(scr.h * 0.33);
  log('광고', `탭 A 플레이어 내부 (${ax}, ${ay})`);
  await adb(`input tap ${ax} ${ay}`);
  await sleep(500);
  // 위치 B: 화면 하단 우측 (풀스크린 광고)
  const bx = Math.round(scr.w * 0.876);
  const by = Math.round(scr.h * 0.857);
  log('광고', `탭 B 화면 하단 (${bx}, ${by})`);
  await adb(`input tap ${bx} ${by}`);
  return true;
}

async function run() {
  log('INIT', `Device: ${SERIAL}`);
  log('INIT', `Search: "${SEARCH_KEYWORD}"`);
  log('INIT', `Like: ${DO_LIKE} | Comment: ${DO_COMMENT}${DO_COMMENT ? ` ("${COMMENT_TEXT}")` : ''}`);
  console.log('─'.repeat(60));

  // Connect
  ws = new WebSocket(XIAOWEI_URL);
  ws.on('message', (raw) => {
    try {
      const resp = JSON.parse(raw.toString());
      if (pendingQueue.length > 0) { const e = pendingQueue.shift(); clearTimeout(e.timeout); e.resolve(resp); }
    } catch {}
  });
  ws.on('error', (err) => { console.error(`WS 에러: ${err.message}`); process.exit(1); });
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('close', () => reject(new Error('연결 실패'))); });
  log('1-연결', '✓ Xiaowei 연결');

  // Setup
  await adb('input keyevent KEYCODE_WAKEUP');
  await sleep(300);
  await adb('settings put system accelerometer_rotation 0');
  await adb('settings put system user_rotation 0');
  await adb('am force-stop com.google.android.youtube');
  await sleep(1000);

  // Search
  const encodedQuery = encodeURIComponent(SEARCH_KEYWORD);
  await adb(`am start -a android.intent.action.VIEW -d 'https://www.youtube.com/results?search_query=${encodedQuery}'`);
  log('2-검색', `"${SEARCH_KEYWORD}"`);
  await sleep(5000);

  let scr = await getScreen();

  // Select video
  let xml = await dumpUI();
  const hasAd = xml.includes('광고') || xml.includes('Ad ·') || xml.includes('Sponsored');
  const midX = Math.round(scr.w / 2);

  if (hasAd) {
    log('3-선택', '⚠ 광고 건너뛰기 — 스크롤');
    await adb(`input swipe ${midX} ${Math.round(scr.h * 0.75)} ${midX} ${Math.round(scr.h * 0.25)} 400`);
    await sleep(2000);
  }

  const tapY = Math.round(scr.h * 0.35);
  await adb(`input tap ${midX} ${tapY}`);
  log('3-선택', `✓ 영상 탭: (${midX}, ${tapY})`);
  await sleep(5000);

  // 프리롤 광고 건너뛰기 (최대 2개 연속, 5회 시도)
  log('4-광고', '6초 대기 (첫 광고 건너뛰기 활성화)...');
  await sleep(6000);

  let adsSkipped = 0;
  for (let i = 0; i < 5; i++) {
    const skipped = await trySkipAd();
    if (skipped) {
      adsSkipped++;
      log('4-광고', `✓ 광고 #${adsSkipped} 건너뛰기 (${i + 1}회)`);
      await sleep(3000);
      continue;
    }

    log('4-광고', `고정 좌표 탭 (${i + 1}회)`);
    await skipAdFixedCoord();
    await sleep(2000);

    const adXml = await dumpUI();
    const hasAd = adXml && (adXml.includes('ad_badge') || adXml.includes('skip_ad') ||
      adXml.includes('ad_progress') || adXml.includes('ad_cta'));
    const hasTitle = adXml && adXml.includes('video_title');

    if (hasTitle && !hasAd) { log('4-광고', `✓ 광고 끝남 (${adsSkipped}개)`); break; }
    if (hasAd) { adsSkipped++; log('4-광고', `광고 #${adsSkipped} — 6초 대기`); await sleep(6000); continue; }

    try {
      const res = await adb('dumpsys media_session | grep "state="');
      if (out(res).includes('state=3')) { log('4-광고', '✓ 재생 중'); break; }
    } catch {}

    if (i < 4) { await sleep(3000); }
  }

  // Ensure playing
  await adb(`input tap ${midX} ${Math.round(scr.h * 0.18)}`);
  await sleep(800);
  await adb(`input tap ${midX} ${Math.round(scr.h * 0.18)}`);
  await sleep(1000);
  await adb('input keyevent KEYCODE_MEDIA_PLAY');
  log('5-재생', '재생 시도');
  await sleep(3000);

  try {
    const res = await adb('dumpsys media_session | grep "state="');
    log('5-재생', out(res).includes('state=3') ? '✓ 재생 중' : '⚠ 재생 상태 불명');
  } catch {}

  // Watch 10 seconds before engagement
  log('6-시청', '10초 시청 후 engagement 시작...');
  await sleep(10000);

  // ═══════════════════════════════════════════════════════
  // LIKE
  // ═══════════════════════════════════════════════════════
  if (DO_LIKE) {
    console.log('─'.repeat(60));
    log('7-좋아요', '좋아요 시도...');

    scr = await getScreen();

    // 먼저 영상 아래로 스크롤 (좋아요 버튼이 보이도록)
    await adb(`input swipe ${midX} ${Math.round(scr.h * 0.60)} ${midX} ${Math.round(scr.h * 0.35)} 300`);
    await sleep(1500);

    // uiautomator로 좋아요 버튼 찾기
    // resource-id 우선 (가장 안정적), content-desc 폴백
    let likeBtn = await findElement('resource-id="com.google.android.youtube:id/like_button"');
    if (!likeBtn) likeBtn = await findElement('content-desc="좋아요"');
    if (!likeBtn) likeBtn = await findElement('content-desc="[^"]*like this video[^"]*"');

    if (likeBtn) {
      log('7-좋아요', `✓ 버튼 발견: (${likeBtn.x}, ${likeBtn.y})`);
      await adb(`input tap ${likeBtn.x} ${likeBtn.y}`);
      await sleep(1500);

      // 좋아요 눌렸는지 확인
      const afterXml = await dumpUI();
      const liked = afterXml.includes('좋아요 취소') || afterXml.includes('unlike') || afterXml.includes('Remove like');
      log('7-좋아요', liked ? '✓ 좋아요 완료!' : '⚠ 좋아요 상태 확인 불가 (이미 눌렸을 수 있음)');
    } else {
      // 폴백: YouTube 좋아요 버튼 일반적 위치
      log('7-좋아요', '⚠ 버튼 못 찾음 — UI dump에서 검색 시도');
      const fullXml = await dumpUI();

      // bounds 가진 모든 노드에서 "좋아요" 포함 여부 검사
      const likeMatch = fullXml.match(/content-desc="[^"]*좋아요[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i)
        || fullXml.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*content-desc="[^"]*좋아요[^"]*"/i);

      if (likeMatch) {
        const lx = Math.round((parseInt(likeMatch[1]) + parseInt(likeMatch[3])) / 2);
        const ly = Math.round((parseInt(likeMatch[2]) + parseInt(likeMatch[4])) / 2);
        log('7-좋아요', `✓ 두 번째 검색 성공: (${lx}, ${ly})`);
        await adb(`input tap ${lx} ${ly}`);
        await sleep(1500);
      } else {
        log('7-좋아요', '✗ 좋아요 버튼을 찾을 수 없음');
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // COMMENT
  // ═══════════════════════════════════════════════════════
  if (DO_COMMENT) {
    console.log('─'.repeat(60));
    log('8-댓글', '댓글 시도...');

    scr = await getScreen();

    // 댓글 섹션까지 스크롤 (영상 아래)
    for (let s = 0; s < 3; s++) {
      await adb(`input swipe ${midX} ${Math.round(scr.h * 0.80)} ${midX} ${Math.round(scr.h * 0.30)} 400`);
      await sleep(1500);

      // 댓글 입력 필드 찾기
      const commentField = await findElement('text="[^"]*댓글[^"]*추가[^"]*"')
        || await findElement('text="[^"]*Add a comment[^"]*"')
        || await findElement('text="[^"]*공개 댓글[^"]*"')
        || await findElement('resource-id="com.google.android.youtube:id/comment_entry_point');

      if (commentField) {
        log('8-댓글', `✓ 댓글 입력 필드 발견: (${commentField.x}, ${commentField.y})`);
        await adb(`input tap ${commentField.x} ${commentField.y}`);
        await sleep(2000);
        break;
      }

      if (s === 2) {
        log('8-댓글', '⚠ 댓글 필드 못 찾음 — 추정 위치 탭');
        // 댓글 섹션 상단 추정 위치
        await adb(`input tap ${midX} ${Math.round(scr.h * 0.85)}`);
        await sleep(2000);
      }
    }

    // 댓글 입력 (클립보드 방식: echo → 붙여넣기)
    log('8-댓글', `입력: "${COMMENT_TEXT}"`);

    // 방법 1: ADBKeyboard broadcast
    const b64 = Buffer.from(COMMENT_TEXT, 'utf-8').toString('base64');
    let inputOk = false;
    try {
      const res = await adb(`am broadcast -a ADB_INPUT_B64 --es msg '${b64}' 2>/dev/null`);
      if (out(res).includes('result=0')) { inputOk = true; log('8-댓글', '✓ ADBKeyboard로 입력'); }
    } catch {}

    // 방법 2: 클립보드에 저장 후 붙여넣기
    if (!inputOk) {
      try {
        const safe = COMMENT_TEXT.replace(/'/g, '').replace(/"/g, '');
        // 파일에 쓴 후 클립보드로 복사
        await adb(`echo '${safe}' > /sdcard/comment.txt`);
        await sleep(300);

        // Samsung 클립보드 서비스 시도
        await adb(`am broadcast -a clipper.set -e text '${safe}' 2>/dev/null`);
        await sleep(300);
        await adb('input keyevent 279');  // KEYCODE_PASTE
        await sleep(500);

        // 입력 확인
        const afterXml = await dumpUI();
        if (afterXml.includes(safe.substring(0, 5))) {
          inputOk = true;
          log('8-댓글', '✓ 클립보드로 입력');
        }
      } catch {}
    }

    // 방법 3: ASCII만 가능한 경우 이모지 댓글
    if (!inputOk) {
      log('8-댓글', '⚠ 한글 입력 불가 — 이모지 댓글로 대체');
      try {
        await adb("input text 'good%svideo'");
        inputOk = true;
      } catch {}
    }

    if (inputOk) {
      await sleep(1000);
      // 게시 버튼 찾기
      const sendBtn = await findElement('content-desc="[^"]*보내기[^"]*"')
        || await findElement('content-desc="[^"]*Send[^"]*"')
        || await findElement('resource-id="com.google.android.youtube:id/send_button"');

      if (sendBtn) {
        log('8-댓글', `게시 버튼: (${sendBtn.x}, ${sendBtn.y})`);
        // 실제 게시는 하지 않음 (테스트 모드)
        log('8-댓글', '⚠ 테스트 모드: 게시하지 않음 (SEND=true 로 실제 게시)');
        if (process.env.SEND === 'true') {
          await adb(`input tap ${sendBtn.x} ${sendBtn.y}`);
          log('8-댓글', '✓ 댓글 게시!');
        }
      } else {
        log('8-댓글', '⚠ 게시 버튼 못 찾음');
      }
    } else {
      log('8-댓글', '✗ 댓글 입력 실패');
    }
  }

  // Done
  console.log('─'.repeat(60));
  await adb('input keyevent KEYCODE_HOME');
  log('완료', '✅ engagement 테스트 완료');
  done();
}

function done() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  setTimeout(() => process.exit(0), 500);
}

run().catch((err) => { console.error(`[FATAL] ${err.message}`); done(); });
