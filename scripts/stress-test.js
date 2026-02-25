/**
 * stress-test.js — PC00 동시성 스트레스 테스트
 *
 * 연결된 기기 N대에 동시에 ADB 명령 (dump → parse → tap) 반복.
 * 응답시간, 성공률, 메모리 사용량 측정.
 *
 * 사용법:
 *   node scripts/stress-test.js                  # 연결된 전체 기기
 *   DURATION_MIN=10 node scripts/stress-test.js  # 10분 연속
 *   ROUNDS=50 node scripts/stress-test.js        # 50라운드
 */
const WebSocket = require('ws');

const XIAOWEI_URL = process.env.XIAOWEI_URL || 'ws://127.0.0.1:22222/';
const DURATION_MIN = parseInt(process.env.DURATION_MIN || '0', 10);
const ROUNDS = parseInt(process.env.ROUNDS || '10', 10);
const MEM_LOG_INTERVAL = 30000; // 30초마다 메모리 로깅

let ws;
const pendingQueue = [];
let requestId = 0;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function send(action, devices, data) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const msg = JSON.stringify({ action, devices, data });
    const timeout = setTimeout(() => {
      const idx = pendingQueue.findIndex(p => p.id === id);
      if (idx !== -1) pendingQueue.splice(idx, 1);
      reject(new Error('Timeout'));
    }, 30000);
    pendingQueue.push({ id, msg, resolve, reject, timeout });
    ws.send(msg);
  });
}

function adb(serial, command) {
  return send('adb_shell', serial, { command });
}

function out(res) {
  if (!res) return '';
  if (typeof res === 'string') return res;
  if (res.data && typeof res.data === 'object' && !Array.isArray(res.data)) {
    const v = Object.values(res.data);
    if (v.length > 0 && typeof v[0] === 'string') return v[0];
  }
  return JSON.stringify(res);
}

function formatMem(bytes) {
  return Math.round(bytes / 1024 / 1024) + 'MB';
}

function logMem(label) {
  const m = process.memoryUsage();
  console.log(`[MEM] ${label} — heap: ${formatMem(m.heapUsed)}/${formatMem(m.heapTotal)}, rss: ${formatMem(m.rss)}`);
}

// ═══════════════════════════════════════════════════════
// 단일 기기 테스트 사이클: dump → parse → tap → verify
// ═══════════════════════════════════════════════════════
async function testCycle(serial) {
  const start = Date.now();
  const errors = [];

  try {
    // 1. UI dump
    await adb(serial, 'uiautomator dump /sdcard/ui.xml');
    await sleep(500);

    // 2. XML 읽기 (parse)
    const res = await adb(serial, 'cat /sdcard/ui.xml');
    const xml = out(res);
    if (!xml || xml.length < 50) {
      errors.push('empty_dump');
    }

    // 3. 화면 탭 (홈 버튼 영역 — 안전한 위치)
    await adb(serial, 'input tap 540 1872');

    // 4. 상태 확인
    await adb(serial, 'echo ok');

  } catch (err) {
    errors.push(err.message);
  }

  return {
    serial,
    durationMs: Date.now() - start,
    success: errors.length === 0,
    errors,
  };
}

// ═══════════════════════════════════════════════════════
// 메인
// ═══════════════════════════════════════════════════════
async function main() {
  console.log('═'.repeat(60));
  console.log('  DoAi.Me Stress Test');
  console.log('═'.repeat(60));

  // 1. WebSocket 연결
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
  console.log('[1] ✓ Xiaowei 연결\n');

  // 2. 연결된 기기 목록
  let serials = [];
  try {
    const listRes = await send('list', '', {});
    if (listRes && listRes.data) {
      if (Array.isArray(listRes.data)) {
        serials = listRes.data.map(d => typeof d === 'string' ? d : d.serial || d.id).filter(Boolean);
      } else if (typeof listRes.data === 'object') {
        serials = Object.keys(listRes.data);
      }
    }
  } catch {}

  // 폴백: adb devices
  if (serials.length === 0) {
    try {
      const devRes = await adb('all', 'echo test');
      const devOut = out(devRes);
      console.log('[2] Xiaowei list 실패, ADB echo 시도:', devOut.substring(0, 100));
    } catch {}
  }

  if (serials.length === 0) {
    // 수동 시리얼 입력 (환경변수)
    const manual = process.env.SERIALS;
    if (manual) {
      serials = manual.split(',').map(s => s.trim()).filter(Boolean);
    }
  }

  if (serials.length === 0) {
    console.error('[2] ✗ 연결된 기기 없음. SERIALS=serial1,serial2,serial3 으로 지정해주세요.');
    process.exit(1);
  }

  const deviceCount = serials.length;
  console.log(`[2] ✓ 기기 ${deviceCount}대 감지: ${serials.join(', ')}\n`);

  // 3. 메모리 모니터링 시작
  logMem('시작');
  const memTimer = setInterval(() => logMem('모니터링'), MEM_LOG_INTERVAL);
  memTimer.unref();

  // 4. 테스트 실행
  const totalRounds = DURATION_MIN > 0 ? Infinity : ROUNDS;
  const deadline = DURATION_MIN > 0 ? Date.now() + DURATION_MIN * 60 * 1000 : Infinity;

  const stats = {
    rounds: 0,
    totalTests: 0,
    successes: 0,
    failures: 0,
    totalDurationMs: 0,
    maxDurationMs: 0,
    minDurationMs: Infinity,
    errorTypes: {},
    perDevice: {},
    adbDisconnects: 0,
  };

  // 기기별 통계 초기화
  for (const s of serials) {
    stats.perDevice[s] = { tests: 0, success: 0, fail: 0, totalMs: 0 };
  }

  console.log(`[3] 테스트 시작 — ${DURATION_MIN > 0 ? DURATION_MIN + '분' : ROUNDS + '라운드'} × ${deviceCount}대 동시\n`);
  console.log('라운드 | 동시 | 성공 | 실패 | 평균(ms) | 최대(ms) | 성공률');
  console.log('─'.repeat(65));

  const testStart = Date.now();

  for (let round = 1; round <= totalRounds; round++) {
    if (Date.now() > deadline) break;

    // 모든 기기에 동시 테스트 사이클 실행
    const promises = serials.map(serial => testCycle(serial));
    const results = await Promise.all(promises);

    let roundSuccess = 0;
    let roundFail = 0;
    let roundTotalMs = 0;
    let roundMaxMs = 0;

    for (const r of results) {
      stats.totalTests++;
      stats.totalDurationMs += r.durationMs;
      if (r.durationMs > stats.maxDurationMs) stats.maxDurationMs = r.durationMs;
      if (r.durationMs < stats.minDurationMs) stats.minDurationMs = r.durationMs;

      roundTotalMs += r.durationMs;
      if (r.durationMs > roundMaxMs) roundMaxMs = r.durationMs;

      const ds = stats.perDevice[r.serial];
      ds.tests++;
      ds.totalMs += r.durationMs;

      if (r.success) {
        stats.successes++;
        roundSuccess++;
        ds.success++;
      } else {
        stats.failures++;
        roundFail++;
        ds.fail++;
        for (const e of r.errors) {
          const type = e.includes('Timeout') ? 'timeout' : e.includes('disconnect') ? 'disconnect' : 'other';
          stats.errorTypes[type] = (stats.errorTypes[type] || 0) + 1;
          if (type === 'disconnect') stats.adbDisconnects++;
        }
      }
    }

    stats.rounds++;
    const avgMs = Math.round(roundTotalMs / results.length);
    const rate = Math.round(roundSuccess / results.length * 100);

    console.log(
      String(round).padStart(6) + ' | ' +
      String(results.length).padStart(4) + ' | ' +
      String(roundSuccess).padStart(4) + ' | ' +
      String(roundFail).padStart(4) + ' | ' +
      String(avgMs).padStart(8) + ' | ' +
      String(roundMaxMs).padStart(8) + ' | ' +
      String(rate).padStart(5) + '%'
    );

    // 라운드 간 쿨다운
    await sleep(1000);
  }

  const elapsed = Math.round((Date.now() - testStart) / 1000);
  clearInterval(memTimer);

  // 5. 결과 요약
  console.log('\n' + '═'.repeat(60));
  console.log('  테스트 결과 요약');
  console.log('═'.repeat(60));

  const avgMs = stats.totalTests > 0 ? Math.round(stats.totalDurationMs / stats.totalTests) : 0;
  const successRate = stats.totalTests > 0 ? Math.round(stats.successes / stats.totalTests * 100) : 0;

  console.log(`  동시 기기:    ${deviceCount}대`);
  console.log(`  라운드:       ${stats.rounds}`);
  console.log(`  총 테스트:    ${stats.totalTests}`);
  console.log(`  성공:         ${stats.successes}`);
  console.log(`  실패:         ${stats.failures}`);
  console.log(`  성공률:       ${successRate}%`);
  console.log(`  실행 시간:    ${elapsed}초`);
  console.log();
  console.log(`  평균 응답:    ${avgMs}ms`);
  console.log(`  최소 응답:    ${stats.minDurationMs === Infinity ? 0 : stats.minDurationMs}ms`);
  console.log(`  최대 응답:    ${stats.maxDurationMs}ms`);
  console.log(`  ADB 끊김:    ${stats.adbDisconnects}회`);
  console.log();

  if (Object.keys(stats.errorTypes).length > 0) {
    console.log('  에러 유형:');
    for (const [type, count] of Object.entries(stats.errorTypes)) {
      console.log(`    ${type}: ${count}회`);
    }
    console.log();
  }

  console.log('  기기별 결과:');
  console.log('  시리얼           | 테스트 | 성공 | 실패 | 평균(ms) | 성공률');
  console.log('  ' + '─'.repeat(58));
  for (const [serial, d] of Object.entries(stats.perDevice)) {
    const dAvg = d.tests > 0 ? Math.round(d.totalMs / d.tests) : 0;
    const dRate = d.tests > 0 ? Math.round(d.success / d.tests * 100) : 0;
    console.log(
      '  ' + serial.substring(0, 16).padEnd(18) + ' | ' +
      String(d.tests).padStart(6) + ' | ' +
      String(d.success).padStart(4) + ' | ' +
      String(d.fail).padStart(4) + ' | ' +
      String(dAvg).padStart(8) + ' | ' +
      String(dRate).padStart(5) + '%'
    );
  }

  // PASS/FAIL 판정
  console.log('\n' + '═'.repeat(60));
  const PASS_CRITERIA = { avgMs: 5000, successRate: 90 };
  const passed = avgMs <= PASS_CRITERIA.avgMs && successRate >= PASS_CRITERIA.successRate;
  console.log(`  판정: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`    평균 응답 ${avgMs}ms ${avgMs <= PASS_CRITERIA.avgMs ? '≤' : '>'} ${PASS_CRITERIA.avgMs}ms`);
  console.log(`    성공률 ${successRate}% ${successRate >= PASS_CRITERIA.successRate ? '≥' : '<'} ${PASS_CRITERIA.successRate}%`);
  console.log('═'.repeat(60));

  logMem('종료');

  ws.close();
  setTimeout(() => process.exit(passed ? 0 : 1), 500);
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
