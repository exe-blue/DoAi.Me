/**
 * test_watch_video.js — ADB 기반 YouTube 자동 시청 단계별 진단
 *
 * Xiaowei WebSocket으로 Galaxy S9에 ADB 명령을 순서대로 보내며
 * 각 단계의 성공/실패를 출력합니다.
 *
 * 사용법: node scripts/test_watch_video.js
 *
 * 환경변수 (선택):
 *   SERIAL=423349535a583098  (기본값)
 *   XIAOWEI_URL=ws://127.0.0.1:22222/  (기본값)
 *   VIDEO_URL=https://www.youtube.com/watch?v=dQw4w9WgXcQ  (테스트 영상)
 *   WATCH_SEC=15  (시청 시간, 기본 15초)
 */
const WebSocket = require('ws');

const SERIAL = process.env.SERIAL || '423349535a583098';
const XIAOWEI_URL = process.env.XIAOWEI_URL || 'ws://127.0.0.1:22222/';
const VIDEO_URL = process.env.VIDEO_URL || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const WATCH_SEC = parseInt(process.env.WATCH_SEC || '15', 10);

let ws;
let requestId = 0;
// FIFO queue: Xiaowei doesn't echo request id, so resolve oldest pending
const pendingQueue = [];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function send(action, devices, data) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const msg = JSON.stringify({ action, devices, data });
    const timeout = setTimeout(() => {
      const idx = pendingQueue.findIndex(p => p.id === id);
      if (idx !== -1) pendingQueue.splice(idx, 1);
      reject(new Error(`Timeout: ${action}`));
    }, 15000);
    pendingQueue.push({ id, resolve, reject, timeout });
    ws.send(msg);
  });
}

function adbShell(command) {
  return send('adb_shell', SERIAL, { command });
}

function log(step, msg) {
  const ts = new Date().toLocaleTimeString('ko-KR');
  console.log(`[${ts}] [${step}] ${msg}`);
}

async function run() {
  log('INIT', `Xiaowei: ${XIAOWEI_URL}`);
  log('INIT', `Device: ${SERIAL}`);
  log('INIT', `Video: ${VIDEO_URL}`);
  log('INIT', `Watch: ${WATCH_SEC}s`);
  console.log('─'.repeat(60));

  // Connect
  ws = new WebSocket(XIAOWEI_URL);

  ws.on('message', (raw) => {
    try {
      const resp = JSON.parse(raw.toString());
      // FIFO: resolve oldest pending (Xiaowei doesn't return request id)
      if (pendingQueue.length > 0) {
        const entry = pendingQueue.shift();
        clearTimeout(entry.timeout);
        entry.resolve(resp);
      } else {
        log('WS', `응답(대기없음): ${raw.toString().substring(0, 200)}`);
      }
    } catch {
      log('WS', `파싱 불가: ${raw.toString().substring(0, 200)}`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS] 에러: ${err.message}`);
    process.exit(1);
  });

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('close', () => reject(new Error('연결 실패')));
  });
  log('1-연결', '✓ Xiaowei 연결 성공');

  // Step 2: Wake device
  try {
    await adbShell('input keyevent KEYCODE_WAKEUP');
    log('2-화면', '✓ WAKEUP 전송');
  } catch (e) {
    log('2-화면', `✗ ${e.message}`);
  }
  await sleep(500);

  // Step 3: Check device alive
  try {
    const res = await adbShell('echo alive');
    const output = extractOutput(res);
    log('3-연결확인', output.includes('alive') ? '✓ 디바이스 응답 OK' : `⚠ 응답: ${output}`);
  } catch (e) {
    log('3-연결확인', `✗ 디바이스 응답 없음: ${e.message}`);
    cleanup();
    return;
  }

  // Step 4: Force portrait (강화)
  try {
    await adbShell('settings put system accelerometer_rotation 0');
    await adbShell('settings put system user_rotation 0');
    // content:// provider 방식 (일부 기기에서 settings put 무시 시)
    await adbShell('content insert --uri content://settings/system --bind name:s:accelerometer_rotation --bind value:i:0');
    await adbShell('content insert --uri content://settings/system --bind name:s:user_rotation --bind value:i:0');
    log('4-세로모드', '✓ 세로 모드 강제 (settings + content provider)');
  } catch (e) {
    log('4-세로모드', `⚠ ${e.message}`);
  }

  // Step 5: Get screen size
  try {
    const res = await adbShell('wm size');
    const output = extractOutput(res);
    log('5-해상도', `✓ ${output.trim()}`);
  } catch (e) {
    log('5-해상도', `⚠ ${e.message}`);
  }

  // Step 6: Kill YouTube
  try {
    await adbShell('am force-stop com.google.android.youtube');
    log('6-YouTube종료', '✓ force-stop');
  } catch (e) {
    log('6-YouTube종료', `⚠ ${e.message}`);
  }
  await sleep(1000);

  // Step 7: Launch YouTube
  try {
    await adbShell('monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1');
    log('7-YouTube실행', '✓ YouTube 앱 실행');
  } catch (e) {
    log('7-YouTube실행', `✗ ${e.message}`);
    cleanup();
    return;
  }
  await sleep(4000);

  // Step 8: Check YouTube foreground
  try {
    const res = await adbShell('dumpsys activity activities | grep mResumedActivity');
    const output = extractOutput(res);
    const isYT = output.includes('youtube');
    log('8-포그라운드', isYT ? '✓ YouTube가 포그라운드' : `⚠ 다른 앱: ${output.trim()}`);
  } catch (e) {
    log('8-포그라운드', `⚠ 확인 불가: ${e.message}`);
  }

  // Step 9: Open video via intent (직접 URL — 가장 확실한 방법)
  try {
    await adbShell(`am start -a android.intent.action.VIEW -d "${VIDEO_URL}"`);
    log('9-영상열기', `✓ intent 전송: ${VIDEO_URL}`);
  } catch (e) {
    log('9-영상열기', `✗ ${e.message}`);
    cleanup();
    return;
  }
  await sleep(5000);

  // Step 10: Ensure playing — 플레이어 탭 + 재생 키 + 재확인
  try {
    // 10a. 플레이어 영역 탭 (컨트롤 표시)
    await adbShell('input tap 540 350');
    await sleep(1000);
    // 10b. 재생 버튼 영역 탭 (재생/일시정지 토글)
    await adbShell('input tap 540 350');
    await sleep(1000);

    const res = await adbShell('dumpsys media_session | grep -E "state="');
    const output = extractOutput(res);
    const isPlaying = output.includes('state=3');
    const isPaused = output.includes('state=2');

    if (isPlaying) {
      log('10-재생상태', '✓ 재생 중 (state=3)');
    } else if (isPaused) {
      log('10-재생상태', '⚠ 일시정지 — MEDIA_PLAY 키 전송');
      await adbShell('input keyevent KEYCODE_MEDIA_PLAY');
      await sleep(1000);
      // 한번 더 탭
      await adbShell('input tap 540 350');
      await sleep(500);
      await adbShell('input tap 540 350');
      await sleep(1000);
      // 재확인
      const res2 = await adbShell('dumpsys media_session | grep -E "state="');
      const out2 = extractOutput(res2);
      log('10-재생상태', out2.includes('state=3') ? '✓ 재생 시작됨' : `⚠ 여전히 멈춤: ${out2.trim().substring(0, 80)}`);
    } else {
      log('10-재생상태', `⚠ 상태 불명: ${output.trim().substring(0, 80)}`);
      // 강제 재생 시도
      await adbShell('input keyevent KEYCODE_MEDIA_PLAY');
      await adbShell('input tap 540 350');
    }
  } catch (e) {
    log('10-재생상태', `⚠ 확인 불가: ${e.message}`);
  }

  // Step 11: Try skip ad
  try {
    const res = await adbShell('uiautomator dump /sdcard/window_dump.xml && cat /sdcard/window_dump.xml');
    const xml = extractOutput(res);
    if (xml.includes('skip_ad') || xml.includes('건너뛰기') || xml.includes('Skip')) {
      log('11-광고', '⚠ 광고 감지 — 건너뛰기 시도');
      await adbShell('input tap 960 580');
      await sleep(2000);
    } else {
      log('11-광고', '✓ 광고 없음');
    }
  } catch (e) {
    log('11-광고', `⚠ UI dump 실패: ${e.message}`);
  }

  // Step 12: Watch
  console.log('─'.repeat(60));
  log('12-시청', `${WATCH_SEC}초 시청 시작...`);

  for (let i = 0; i < WATCH_SEC; i += 5) {
    const remaining = Math.min(5, WATCH_SEC - i);
    await sleep(remaining * 1000);

    // Keep screen on
    if (i % 10 === 0 && i > 0) {
      await adbShell('input keyevent KEYCODE_WAKEUP').catch(() => {});
    }

    // Check still playing + try resume if paused
    if (i % 10 === 0) {
      try {
        const res = await adbShell('dumpsys media_session | grep "state="');
        const output = extractOutput(res);
        const playing = output.includes('state=3');
        if (playing) {
          log('12-시청', `${i + remaining}/${WATCH_SEC}s ▶ 재생 중`);
        } else {
          log('12-시청', `${i + remaining}/${WATCH_SEC}s ⏸ 멈춤 → 재생 시도`);
          await adbShell('input tap 540 350');
          await sleep(500);
          await adbShell('input tap 540 350');
          await sleep(500);
          await adbShell('input keyevent KEYCODE_MEDIA_PLAY');
        }
      } catch {
        log('12-시청', `${i + remaining}/${WATCH_SEC}s (상태 확인 불가)`);
      }
    }
  }

  log('12-시청', `✓ ${WATCH_SEC}초 시청 완료`);

  // Step 13: Go home
  try {
    await adbShell('input keyevent KEYCODE_HOME');
    log('13-종료', '✓ 홈으로 이동');
  } catch (e) {
    log('13-종료', `⚠ ${e.message}`);
  }

  console.log('─'.repeat(60));
  log('완료', '✅ 전체 테스트 완료');

  cleanup();
}

function extractOutput(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  // Xiaowei format: {code, message, data: {"serial": "output"}}
  if (res.data != null && typeof res.data === 'object' && !Array.isArray(res.data)) {
    const vals = Object.values(res.data);
    if (vals.length > 0 && typeof vals[0] === 'string') return vals[0];
    if (vals.length > 0) return JSON.stringify(vals[0]);
  }
  if (res.data != null) {
    if (Array.isArray(res.data)) return res.data[0] != null ? String(res.data[0]) : '';
    return String(res.data);
  }
  if (res.msg != null) return String(res.msg);
  if (res.stdout != null) return String(res.stdout);
  return JSON.stringify(res);
}

function cleanup() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  setTimeout(() => process.exit(0), 500);
}

run().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  cleanup();
});
