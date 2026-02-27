#!/usr/bin/env node
/**
 * DoAi.Me — 24시간 직접 영상 시청 스트레스 테스트
 *
 * Xiaowei WebSocket으로 디바이스에 직접 YouTube 시청 명령 전송.
 * 15개 영상을 디바이스들에 분배하여 연속 반복 재생.
 *
 * ⚠ Agent(PM2)를 먼저 중지하고 실행할 것:
 *   pm2 stop agent-farm
 *   cd agent && node stress-test-loop.js
 *
 * 환경변수 (.env):
 *   SUPABASE_URL, SUPABASE_ANON_KEY (필수)
 *   XIAOWEI_WS_URL (기본: ws://127.0.0.1:22222/)
 *   STRESS_WATCH_SEC   — 영상당 시청 시간 초 (기본: 60)
 *   STRESS_PAUSE_SEC   — 영상 간 쉬는 시간 초 (기본: 5)
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const { createClient } = require("@supabase/supabase-js");
const XiaoweiClient = require("./xiaowei-client");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const XIAOWEI_WS_URL = process.env.XIAOWEI_WS_URL || "ws://127.0.0.1:22222/";
const WATCH_SEC = parseInt(process.env.STRESS_WATCH_SEC || "60", 10);
const PAUSE_SEC = parseInt(process.env.STRESS_PAUSE_SEC || "5", 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("[Stress] SUPABASE_URL and SUPABASE_ANON_KEY required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const xiaowei = new XiaoweiClient(XIAOWEI_WS_URL);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const ts = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });

let running = true;
const startedAt = Date.now();
const stats = { totalWatches: 0, perDevice: new Map(), rounds: 0 };

function elapsed() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

async function getDeviceSerials() {
  const res = await xiaowei.list();
  let serials = [];
  if (Array.isArray(res)) {
    serials = res.map((d) => d.onlySerial || d.serial || d.id || d.deviceId).filter(Boolean);
  } else if (res && typeof res === "object") {
    const data = res.data || res.devices || res.list;
    if (Array.isArray(data)) {
      serials = data.map((d) => d.onlySerial || d.serial || d.id || d.deviceId).filter(Boolean);
    }
  }
  return serials;
}

async function getActiveVideos() {
  const { data, error } = await supabase
    .from("videos")
    .select("id, title, duration_sec")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`[Stress] videos query: ${error.message}`);
    return [];
  }
  return (data || []).map((v) => ({
    id: v.id,
    title: v.title || v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    durationSec: v.duration_sec || WATCH_SEC,
  }));
}

async function trySkipAd(serial) {
  try {
    await xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
    await sleep(300);
    const xml = await dumpUi(serial);
    if (!xml) return;

    // "건너뛰기" or "Skip" button
    const skipPatterns = [
      /content-desc="건너뛰기"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
      /content-desc="Skip[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
      /resource-id="com\.google\.android\.youtube:id\/skip_ad_button"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i,
    ];
    for (const pat of skipPatterns) {
      const m = xml.match(pat);
      if (m) {
        const cx = Math.round((parseInt(m[1]) + parseInt(m[3])) / 2);
        const cy = Math.round((parseInt(m[2]) + parseInt(m[4])) / 2);
        await xiaowei.adbShell(serial, `input tap ${cx} ${cy}`);
        console.log(`  [${serial.substring(0, 6)}] ⏭ ad skipped`);
        await sleep(1500);
        return;
      }
    }
  } catch {}
}

async function dumpUi(serial) {
  try {
    await xiaowei.adbShell(serial, "uiautomator dump /sdcard/window_dump.xml");
    await sleep(500);
    const res = await xiaowei.adbShell(serial, "cat /sdcard/window_dump.xml");
    if (res == null) return "";
    if (typeof res === "string") return res;
    if (res.data != null) return Array.isArray(res.data) ? String(res.data[0] || "") : String(res.data);
    if (res.msg != null) return String(res.msg);
    return String(res);
  } catch {
    return "";
  }
}

/**
 * 한 디바이스에서 한 영상 시청
 */
async function watchVideo(serial, video) {
  const tag = serial.substring(0, 6);
  const watchSec = rand(
    Math.round(video.durationSec * 0.3),
    Math.round(video.durationSec * 0.9)
  );

  console.log(`  [${tag}] ▶ "${video.title}" (${watchSec}s)`);

  try {
    // 1. 화면 켜기 + 세로 고정
    await xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
    await sleep(500);
    await xiaowei.adbShell(serial, "settings put system accelerometer_rotation 0");
    await xiaowei.adbShell(serial, "settings put system user_rotation 0");

    // 2. YouTube 종료 후 URL로 직접 열기
    await xiaowei.adbShell(serial, "am force-stop com.google.android.youtube");
    await sleep(1000);
    await xiaowei.adbShell(serial, `am start -a android.intent.action.VIEW -d '${video.url}'`);
    await sleep(rand(4000, 6000));

    // 3. 광고 건너뛰기
    await trySkipAd(serial);

    // 4. 시청 루프 (5초마다 체크)
    let watched = 0;
    const targetMs = watchSec * 1000;
    while (watched < targetMs && running) {
      const tick = Math.min(5000, targetMs - watched);
      await sleep(tick);
      watched += tick;

      // 15초마다 광고 체크
      if (watched % 15000 < 5000) {
        await trySkipAd(serial);
      }
      // 30초마다 화면 깨우기
      if (watched % 30000 < 5000) {
        await xiaowei.adbShell(serial, "input keyevent KEYCODE_WAKEUP");
      }
    }

    // 5. 홈으로 복귀
    await xiaowei.goHome(serial);
    await sleep(500);

    stats.totalWatches++;
    const dc = stats.perDevice.get(serial) || 0;
    stats.perDevice.set(serial, dc + 1);

    console.log(`  [${tag}] ✓ done (${watchSec}s)`);
  } catch (err) {
    console.error(`  [${tag}] ✗ ${err.message}`);
    try { await xiaowei.goHome(serial); } catch {}
  }
}

/**
 * 디바이스 워커: 영상 리스트를 라운드로빈으로 순환
 */
async function deviceWorker(serial, videos, startIndex) {
  let idx = startIndex;
  while (running) {
    const video = videos[idx % videos.length];
    await watchVideo(serial, video);
    idx++;

    if (!running) break;
    const pauseMs = rand(PAUSE_SEC * 500, PAUSE_SEC * 1500);
    await sleep(pauseMs);
  }
}

function printStats(deviceCount, videoCount) {
  console.log("\n─────────────────────────────────────────────────");
  console.log(
    `[${ts()}] ${elapsed()} | ` +
    `devices=${deviceCount} videos=${videoCount} | ` +
    `total_watches=${stats.totalWatches} rounds=${stats.rounds}`
  );
  for (const [serial, count] of stats.perDevice) {
    console.log(`  ${serial.substring(0, 10).padEnd(10)} : ${count} watches`);
  }
  console.log("─────────────────────────────────────────────────\n");
}

async function main() {
  // 1. Xiaowei 연결
  console.log(`[Stress] Connecting to Xiaowei (${XIAOWEI_WS_URL})...`);
  await new Promise((resolve, reject) => {
    if (xiaowei.connected) return resolve();
    const timeout = setTimeout(() => reject(new Error("Xiaowei connection timeout (10s)")), 10000);
    xiaowei.once("connected", () => { clearTimeout(timeout); resolve(); });
    xiaowei.connect();
  });
  console.log("[Stress] ✓ Xiaowei connected\n");

  // 2. 디바이스 목록
  const serials = await getDeviceSerials();
  if (serials.length === 0) {
    console.error("[Stress] No devices connected to Xiaowei");
    process.exit(1);
  }

  // 3. 영상 목록
  const videos = await getActiveVideos();
  if (videos.length === 0) {
    console.error("[Stress] No active videos. Set status='active' in videos table.");
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════");
  console.log("  DoAi.Me — Direct Video Stress Test");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Xiaowei:     ${XIAOWEI_WS_URL}`);
  console.log(`  Devices:     ${serials.length}`);
  console.log(`  Videos:      ${videos.length}`);
  console.log(`  Watch time:  ~${WATCH_SEC}s per video (30-90% range)`);
  console.log(`  Pause:       ~${PAUSE_SEC}s between videos`);
  console.log("═══════════════════════════════════════════════════");
  console.log("\n  Videos:");
  videos.forEach((v, i) => console.log(`    ${String(i + 1).padStart(2)}. ${v.title}`));
  console.log("\n  Devices:");
  serials.forEach((s, i) => console.log(`    ${String(i + 1).padStart(2)}. ${s}`));
  console.log(`\n[${ts()}] Starting... (Ctrl+C to stop)\n`);

  // 4. 디바이스별 워커 시작 (각자 다른 시작 인덱스)
  const workers = serials.map((serial, i) => {
    const startIdx = i % videos.length;
    return deviceWorker(serial, videos, startIdx);
  });

  // 5. 통계 출력 (60초마다)
  const statsInterval = setInterval(() => {
    if (running) {
      stats.rounds = Math.floor(stats.totalWatches / serials.length);
      printStats(serials.length, videos.length);
    }
  }, 60000);

  // 6. 종료 처리
  const shutdown = async () => {
    if (!running) return;
    running = false;
    console.log(`\n[${ts()}] Stopping all devices...`);

    clearInterval(statsInterval);

    for (const serial of serials) {
      try { await xiaowei.goHome(serial); } catch {}
    }

    console.log("\n═══════════════════════════════════════════════════");
    console.log("  Stress Test Results");
    console.log("═══════════════════════════════════════════════════");
    console.log(`  Runtime:         ${elapsed()}`);
    console.log(`  Total watches:   ${stats.totalWatches}`);
    console.log(`  Avg per device:  ${serials.length > 0 ? (stats.totalWatches / serials.length).toFixed(1) : 0}`);
    console.log("═══════════════════════════════════════════════════");
    xiaowei.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await Promise.allSettled(workers);
}

main().catch((err) => {
  console.error(`[Stress] Fatal: ${err.message}`);
  process.exit(1);
});
