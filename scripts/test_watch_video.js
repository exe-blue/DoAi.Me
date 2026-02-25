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
const SEARCH_KEYWORD = process.env.SEARCH_KEYWORD || '[에디터픽] 마약왕 사살에 폭주하는 카르텔 보복';

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
async function trySkipAd() {
  const xml = await dumpUI();
  if (xml.includes('skip_ad') || xml.includes('건너뛰기') || xml.includes('Skip') || xml.includes('skip')) {
    const pos = await findElement('skip_ad|건너뛰기|Skip');
    if (pos) {
      await adb(`input tap ${pos.x} ${pos.y}`);
    } else {
      const scr = await getScreen();
      const sx = scr.landscape ? Math.round(scr.w * 0.88) : Math.round(scr.w * 0.89);
      const sy = scr.landscape ? Math.round(scr.h * 0.85) : Math.round(scr.h * 0.3);
      await adb(`input tap ${sx} ${sy}`);
    }
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

  // 4. YouTube 종료 → 실행
  await adb('am force-stop com.google.android.youtube');
  await sleep(1000);
  await adb('monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1');
  log('4-YouTube', '✓ 앱 실행');
  await sleep(4000);

  // 화면 방향 재확인 (YouTube가 가로로 바꿀 수 있음)
  scr = await getScreen();
  log('4-YouTube', `현재 화면: ${scr.w}x${scr.h} (${scr.landscape ? '가로' : '세로'})`);

  // 5. 검색 아이콘 찾기 (uiautomator → 폴백 좌표)
  log('5-검색', '검색 아이콘 찾기...');
  let searchBtn = await findElement('content-desc="검색"');
  if (!searchBtn) searchBtn = await findElement('content-desc="Search"');
  if (!searchBtn) searchBtn = await findElement('resource-id="com.google.android.youtube:id/menu_item_1"');

  if (searchBtn) {
    log('5-검색', `✓ 검색 버튼 발견: (${searchBtn.x}, ${searchBtn.y})`);
    await adb(`input tap ${searchBtn.x} ${searchBtn.y}`);
  } else {
    // 폴백: 화면 크기 기반 추정 좌표
    const sx = scr.landscape ? Math.round(scr.w * 0.90) : Math.round(scr.w * 0.86);
    const sy = scr.landscape ? Math.round(scr.h * 0.07) : Math.round(scr.h * 0.04);
    log('5-검색', `⚠ 버튼 못 찾음 — 추정 좌표 (${sx}, ${sy})`);
    await adb(`input tap ${sx} ${sy}`);
  }
  await sleep(2000);

  // 6. 검색어 입력
  log('6-입력', `"${SEARCH_KEYWORD}"`);
  await inputText(SEARCH_KEYWORD);
  await sleep(1000);
  await adb('input keyevent KEYCODE_ENTER');
  log('6-입력', '✓ 검색 실행');
  await sleep(4000);

  // 화면 재확인
  scr = await getScreen();

  // 7. 검색 결과에서 스크롤 + 영상 선택
  log('7-선택', '검색 결과 — 광고 건너뛰기 위해 스크롤');
  const midX = Math.round(scr.w / 2);
  // 스크롤: 화면 하단 70% → 30% (광고 1개 지나감)
  const fromY = Math.round(scr.h * 0.70);
  const toY = Math.round(scr.h * 0.30);
  await adb(`input swipe ${midX} ${fromY} ${midX} ${toY} 400`);
  await sleep(2000);

  // 두 번째 결과 영역 탭 (화면 중앙 약간 위)
  const tapY = Math.round(scr.h * 0.40);
  log('7-선택', `탭: (${midX}, ${tapY})`);
  await adb(`input tap ${midX} ${tapY}`);
  await sleep(5000);

  // 8. 광고 건너뛰기 (최대 3회)
  for (let i = 0; i < 3; i++) {
    const skipped = await trySkipAd();
    if (skipped) {
      log('8-광고', `광고 건너뛰기 (${i + 1}회)`);
      await sleep(2000);
    } else {
      const xml = await dumpUI();
      if (xml.includes('Ad') || xml.includes('광고')) {
        log('8-광고', `광고 재생 중 — 5초 대기`);
        await sleep(5000);
      } else {
        log('8-광고', '✓ 광고 없음');
        break;
      }
    }
  }

  // 9. 재생 확인 + 강제 재생
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
      log('9-재생', '✓ 재생 중');
    } else {
      log('9-재생', '⚠ 재생 안 됨 — MEDIA_PLAY 전송');
      await adb('input keyevent KEYCODE_MEDIA_PLAY');
    }
  } catch {
    log('9-재생', '⚠ 상태 확인 불가');
  }

  // 10. 시청
  console.log('─'.repeat(60));
  log('10-시청', `${WATCH_SEC}초 시청 시작`);

  for (let i = 0; i < WATCH_SEC; i += 5) {
    const tick = Math.min(5, WATCH_SEC - i);
    await sleep(tick * 1000);

    if (i > 0 && i % 15 === 0) {
      await adb('input keyevent KEYCODE_WAKEUP').catch(() => {});
      const skipped = await trySkipAd();
      if (skipped) log('10-시청', '⏭ 중간 광고 건너뛰기');
    }

    if (i % 10 === 0) {
      try {
        const res = await adb('dumpsys media_session | grep "state="');
        const s = out(res);
        const playing = s.includes('state=3');
        if (playing) {
          log('10-시청', `${i + tick}/${WATCH_SEC}s ▶ 재생 중`);
        } else {
          log('10-시청', `${i + tick}/${WATCH_SEC}s ⏸ 멈춤 → 재생 시도`);
          await adb(`input tap ${playerX} ${playerY}`);
          await sleep(500);
          await adb(`input tap ${playerX} ${playerY}`);
          await adb('input keyevent KEYCODE_MEDIA_PLAY');
        }
      } catch {
        log('10-시청', `${i + tick}/${WATCH_SEC}s`);
      }
    }
  }

  log('10-시청', `✓ ${WATCH_SEC}초 시청 완료`);
  await adb('input keyevent KEYCODE_HOME');
  log('11-종료', '✓ 홈으로 이동');
  console.log('─'.repeat(60));
  log('완료', '✅ 전체 테스트 완료');
  done();
}

function done() {
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  setTimeout(() => process.exit(0), 500);
}

run().catch((err) => { console.error(`[FATAL] ${err.message}`); done(); });
