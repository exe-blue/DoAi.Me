/**
 * test_watch_video.js — ADB 기반 YouTube 자동 시청 진단 (가로/세로 자동 대응)
 *
 * 사용법:
 *   node scripts/test_watch_video.js
 *   SEARCH_KEYWORD="검색어" WATCH_SEC=60 node scripts/test_watch_video.js
 */
const WebSocket = require('ws');

const SERIAL = process.env.SERIAL || '423349535a583098';
const XIAOWEI_URL = process.env.XIAOWEI_URL || 'ws://127.0.0.1:22222/';
const WATCH_SEC = parseInt(process.env.WATCH_SEC || '30', 10);
const SEARCH_KEYWORD = process.env.SEARCH_KEYWORD || '마약왕 사살에 피의 복수 멕시코 카르텔 테러 확산 JTBC 뉴스룸';

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

function adb(command) {
  return send('adb_shell', SERIAL, { command });
}

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

/** 현재 화면 크기 가져오기 → {w, h, landscape} */
async function getScreen() {
  try {
    const res = await adb('wm size');
    const s = out(res);
    const m = s.match(/(\d+)x(\d+)/);
    if (m) {
      const w = parseInt(m[1]), h = parseInt(m[2]);
      return { w, h, landscape: w > h };
    }
  } catch {}
  return { w: 1080, h: 1920, landscape: false };
}

/** UI dump에서 특정 텍스트/resource-id의 bounds 중심 좌표 찾기 */
async function findElement(pattern) {
  try {
    await adb('uiautomator dump /sdcard/ui.xml');
    await sleep(800);
    const res = await adb('cat /sdcard/ui.xml');
    const xml = out(res);
    if (!xml) return null;

    const re = new RegExp(pattern + '[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"', 'i');
    let match = xml.match(re);
    if (!match) {
      const re2 = new RegExp('bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*' + pattern, 'i');
      match = xml.match(re2);
    }
    if (match) {
      const cx = Math.round((parseInt(match[1]) + parseInt(match[3])) / 2);
      const cy = Math.round((parseInt(match[2]) + parseInt(match[4])) / 2);
      return { x: cx, y: cy };
    }
    return null;
  } catch { return null; }
}

/** UI dump 전체 텍스트 반환 */
async function dumpUI() {
  try {
    await adb('uiautomator dump /sdcard/ui.xml');
    await sleep(800);
    const res = await adb('cat /sdcard/ui.xml');
    return out(res);
  } catch { return ''; }
}

/** 한글/유니코드 텍스트 입력 (ADBKeyboard broadcast → 클립보드 → ASCII 폴백) */
async function inputText(text) {
  const b64 = Buffer.from(text, 'utf-8').toString('base64');
  try {
    const res = await adb(`am broadcast -a ADB_INPUT_B64 --es msg '${b64}' 2>/dev/null`);
    if (out(res).includes('result=0')) return;
  } catch {}
  try {
    const safe = text.replace(/'/g, '');
    await adb(`am broadcast -a clipper.set -e text '${safe}' 2>/dev/null`);
    await sleep(300);
    await adb('input keyevent 279');
    return;
  } catch {}
  if (/^[\x20-\x7e]+$/.test(text)) {
    await adb(`input text '${text.replace(/ /g, '%s').replace(/'/g, '')}'`);
  }
}

/** 광고 건너뛰기 시도 */
/** 광고 건너뛰기: 1회 dump에서 바로 좌표 추출 + 탭 */
async function trySkipAd() {
  const xml = await dumpUI();
  if (!xml) return false;

  const keywords = ['skip_ad', '건너뛰기', 'Skip ad', 'Skip'];
  for (const kw of keywords) {
    if (!xml.includes(kw)) continue;

    // 해당 키워드 포함 노드에서 bounds 직접 추출 (같은 XML에서)
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(escaped + '[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"', 'i'),
      new RegExp('bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*' + escaped, 'i'),
    ];

    for (const re of patterns) {
      const m = xml.match(re);
      if (m) {
        const cx = Math.round((parseInt(m[1]) + parseInt(m[3])) / 2);
        const cy = Math.round((parseInt(m[2]) + parseInt(m[4])) / 2);
        log('광고', `"${kw}" 발견 → 탭 (${cx}, ${cy})`);
        await adb(`input tap ${cx} ${cy}`);
        return true;
      }
    }

    // bounds 못 찾았지만 키워드는 있음 → 폴백 좌표 (x85% y22%)
    const scr = await getScreen();
    const sx = Math.round(scr.w * 0.85);
    const sy = Math.round(scr.h * 0.22);
    log('광고', `"${kw}" 발견 but bounds 없음 → 폴백 탭 (${sx}, ${sy})`);
    await adb(`input tap ${sx} ${sy}`);
    return true;
  }
  return false;
}

async function run() {
  log('INIT', `Device: ${SERIAL} | Xiaowei: ${XIAOWEI_URL}`);
  log('INIT', `Search: "${SEARCH_KEYWORD}" | Watch: ${WATCH_SEC}s`);
  console.log('─'.repeat(60));

  ws = new WebSocket(XIAOWEI_URL);
  ws.on('message', (raw) => {
    try {
      const resp = JSON.parse(raw.toString());
      if (pendingQueue.length > 0) {
        const entry = pendingQueue.shift();
        clearTimeout(entry.timeout);
        entry.resolve(resp);
      }
    } catch {}
  });
  ws.on('error', (err) => { console.error(`WS 에러: ${err.message}`); process.exit(1); });
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('close', () => reject(new Error('연결 실패')));
  });
  log('1-연결', '✓ Xiaowei 연결');

  // 2. Wake + 세로 강제
  await adb('input keyevent KEYCODE_WAKEUP');
  await sleep(300);
  await adb('settings put system accelerometer_rotation 0');
  await adb('settings put system user_rotation 0');
  await adb('content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0');
  await adb('content insert --uri content://settings/system --bind name:s:user_rotation --bind value:i:0');
  log('2-설정', '✓ WAKEUP + 세로모드');

  // 3. 화면 크기 확인
  let scr = await getScreen();
  log('3-화면', `${scr.w}x${scr.h} (${scr.landscape ? '가로' : '세로'})`);

  // 4. YouTube 종료
  await adb('am force-stop com.google.android.youtube');
  await sleep(1000);

  // 5. YouTube 검색 결과 URL로 직접 열기 (한글 입력 불필요)
  const encodedQuery = encodeURIComponent(SEARCH_KEYWORD);
  const searchUrl = `https://www.youtube.com/results?search_query=${encodedQuery}`;
  log('5-검색', `YouTube 검색 결과 URL 열기`);
  log('5-검색', `검색어: "${SEARCH_KEYWORD}"`);
  await adb(`am start -a android.intent.action.VIEW -d '${searchUrl}'`);
  await sleep(5000);

  // 화면 방향 재확인
  scr = await getScreen();
  log('5-검색', `✓ 검색 결과 페이지 열림 (${scr.w}x${scr.h} ${scr.landscape ? '가로' : '세로'})`);

  // 6. 검색 결과에서 영상 선택 (광고면 스크롤, 아니면 바로 탭)
  const midX = Math.round(scr.w / 2);

  // UI dump로 첫 번째 결과가 광고인지 확인
  let xml = await dumpUI();
  const hasAdLabel = xml.includes('광고') || xml.includes('Ad ·') || xml.includes('Sponsored');

  if (hasAdLabel) {
    log('6-선택', '⚠ 첫 결과가 광고 — 스크롤 후 선택');
    const fromY = Math.round(scr.h * 0.75);
    const toY = Math.round(scr.h * 0.25);
    await adb(`input swipe ${midX} ${fromY} ${midX} ${toY} 400`);
    await sleep(2000);
    const tapY = Math.round(scr.h * 0.35);
    log('6-선택', `영상 탭: (${midX}, ${tapY})`);
    await adb(`input tap ${midX} ${tapY}`);
  } else {
    // 광고 아님 → 첫 번째 결과 바로 탭 (검색 결과 상단 영역)
    const tapY = Math.round(scr.h * 0.35);
    log('6-선택', `✓ 광고 없음 — 첫 결과 바로 탭: (${midX}, ${tapY})`);
    await adb(`input tap ${midX} ${tapY}`);
  }
  await sleep(5000);

  // 7. 프리롤 광고 건너뛰기 (최대 3회)
  for (let i = 0; i < 3; i++) {
    const skipped = await trySkipAd();
    if (skipped) {
      log('7-광고', `광고 건너뛰기 (${i + 1}회)`);
        await sleep(2000);
    } else {
      const adXml = await dumpUI();
      if (adXml.includes('Ad') || adXml.includes('광고')) {
        log('7-광고', `광고 재생 중 — 5초 대기`);
        await sleep(5000);
      } else {
        log('7-광고', '✓ 광고 없음');
        break;
      }
    }
  }

  // 8. 재생 확인 + 강제 재생
  scr = await getScreen();
  const playerX = Math.round(scr.w / 2);
  const playerY = scr.landscape ? Math.round(scr.h / 2) : Math.round(scr.h * 0.18);

  await adb(`input tap ${playerX} ${playerY}`);
  await sleep(800);
  await adb(`input tap ${playerX} ${playerY}`);
  await sleep(1000);

  try {
    const res = await adb('dumpsys media_session | grep "state="');
    const s = out(res);
    if (s.includes('state=3')) {
      log('8-재생', '✓ 재생 중');
    } else {
      log('8-재생', '⚠ 재생 안 됨 — MEDIA_PLAY 전송');
      await adb('input keyevent KEYCODE_MEDIA_PLAY');
    }
  } catch {
    log('8-재생', '⚠ 상태 확인 불가');
  }

  // 9. 시청
  console.log('─'.repeat(60));
  log('9-시청', `${WATCH_SEC}초 시청 시작`);

  for (let i = 0; i < WATCH_SEC; i += 5) {
    const tick = Math.min(5, WATCH_SEC - i);
    await sleep(tick * 1000);

    if (i > 0 && i % 15 === 0) {
      await adb('input keyevent KEYCODE_WAKEUP').catch(() => {});
      const skipped = await trySkipAd();
      if (skipped) log('9-시청', '⏭ 중간 광고 건너뛰기');
    }

    if (i % 10 === 0) {
      try {
        const res = await adb('dumpsys media_session | grep "state="');
        const s = out(res);
        const playing = s.includes('state=3');
        if (playing) {
          log('9-시청', `${i + tick}/${WATCH_SEC}s ▶ 재생 중`);
        } else {
          log('9-시청', `${i + tick}/${WATCH_SEC}s ⏸ 멈춤 → 재생 시도`);
          await adb(`input tap ${playerX} ${playerY}`);
          await sleep(500);
          await adb(`input tap ${playerX} ${playerY}`);
          await adb('input keyevent KEYCODE_MEDIA_PLAY');
        }
      } catch {
        log('9-시청', `${i + tick}/${WATCH_SEC}s`);
      }
    }
  }

  log('9-시청', `✓ ${WATCH_SEC}초 시청 완료`);
  await adb('input keyevent KEYCODE_HOME');
  log('10-종료', '✓ 홈으로 이동');
  console.log('─'.repeat(60));
  log('완료', '✅ 전체 테스트 완료');
  done();
}

function done() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  setTimeout(() => process.exit(0), 500);
}

run().catch((err) => { console.error(`[FATAL] ${err.message}`); done(); });
