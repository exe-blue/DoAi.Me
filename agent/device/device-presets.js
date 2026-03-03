/**
 * DoAi.Me - Device Preset Commands
 * Agent와 웹 API에서 공통 사용하는 프리셋 모듈
 *
 * Xiaowei API 포맷:
 *   runAdbShell(xiaowei, serial, command)
 *   → 응답: { code: 10000, data: { [serial]: "결과\n" } }
 */

const path = require('path');
const sleep = require('../lib/sleep');


const XIAOWEI_TOOLS_DIR = process.env.XIAOWEI_TOOLS_DIR || '/mnt/c/Program Files (x86)/xiaowei/tools';

const _randInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// ════════════════════════════════════════════════════════════
//  PRESET: SCAN
// ════════════════════════════════════════════════════════════
async function scan(xiaowei, serial) {
  const results = {};

  const checks = [
    { key: "model", cmd: "getprop ro.product.model" },
    { key: "android_version", cmd: "getprop ro.build.version.release" },
    { key: "sdk_version", cmd: "getprop ro.build.version.sdk" },
    { key: "screen_size", cmd: "wm size" },
    { key: "screen_density", cmd: "wm density" },
    { key: "auto_rotate", cmd: "settings get system accelerometer_rotation" },
    { key: "user_rotation", cmd: "settings get system user_rotation" },
    { key: "screen_timeout", cmd: "settings get system screen_off_timeout" },
    { key: "brightness", cmd: "settings get system screen_brightness" },
    { key: "brightness_auto", cmd: "settings get system screen_brightness_mode" },
    { key: "stay_on_plugged", cmd: "settings get global stay_on_while_plugged_in" },
    { key: "media_volume", cmd: "settings get system volume_music_speaker" },
    { key: "window_anim", cmd: "settings get global window_animation_scale" },
    { key: "transition_anim", cmd: "settings get global transition_animation_scale" },
    { key: "animator_dur", cmd: "settings get global animator_duration_scale" },
    { key: "timezone", cmd: "getprop persist.sys.timezone" },
    { key: "dnd_mode", cmd: "settings get global zen_mode" },
    { key: "battery_level", cmd: "dumpsys battery | grep level" },
    { key: "battery_status", cmd: "dumpsys battery | grep status" },
    { key: "youtube_version", cmd: "dumpsys package com.google.android.youtube | grep versionName | head -1" },
    { key: "adb_keyboard", cmd: "pm list packages com.android.adbkeyboard" },
    { key: "current_keyboard", cmd: "settings get secure default_input_method" },
    { key: "http_proxy", cmd: "settings get global http_proxy" },
    { key: "mem_available", cmd: "cat /proc/meminfo | grep MemAvailable | head -1" },
    { key: "current_focus", cmd: "dumpsys window | grep mCurrentFocus" },
  ];

  for (const check of checks) {
    try {
      const res = await xiaowei.adbShell(serial, check.cmd);
    } catch (err) {
      results[check.key] = `ERROR: ${err.message}`;
    }
    await sleep(150);
  }

  // 파싱
  const parsed = {
    serial,
    model: results.model || "unknown",
    android_version: results.android_version || "unknown",
    sdk_version: results.sdk_version || "unknown",
    screen_size: results.screen_size || "unknown",
    screen_density: results.screen_density || "unknown",
    auto_rotate: results.auto_rotate === "1",
    user_rotation: results.user_rotation || "0",
    screen_timeout: parseInt(results.screen_timeout) || 0,
    brightness: parseInt(results.brightness) || 0,
    brightness_auto: results.brightness_auto === "1",
    stay_on_plugged: parseInt(results.stay_on_plugged) || 0,
    media_volume: parseInt(results.media_volume) || 0,
    animations_off:
      results.window_anim === "0" &&
      results.transition_anim === "0" &&
      results.animator_dur === "0",
    timezone: results.timezone || "unknown",
    dnd_enabled: results.dnd_mode === "1",
    battery_level:
      parseInt((results.battery_level || "").match(/\d+/)?.[0]) || 0,
    battery_charging:
      (results.battery_status || "").includes("2") ||
      (results.battery_status || "").includes("5"),
    youtube_version:
      (results.youtube_version || "").match(/versionName=([\d.]+)/)?.[1] ||
      "unknown",
    adb_keyboard_installed: (results.adb_keyboard || "").includes(
      "com.android.adbkeyboard"
    ),
    current_keyboard: results.current_keyboard || "unknown",
    http_proxy:
      results.http_proxy === "null" || !results.http_proxy
        ? null
        : results.http_proxy,
    mem_available_kb:
      parseInt((results.mem_available || "").match(/\d+/)?.[0]) || 0,
    raw: results,
  };

  // 문제점 진단
  parsed.issues = [];
  if (parsed.auto_rotate) parsed.issues.push("auto_rotate_on");
  if (parsed.screen_timeout < 2147483000)
    parsed.issues.push("screen_timeout_short");
  if (parsed.brightness > 5) parsed.issues.push("brightness_high");
  if (parsed.media_volume > 0) parsed.issues.push("volume_not_zero");
  if (!parsed.animations_off) parsed.issues.push("animations_on");
  if (!parsed.dnd_enabled) parsed.issues.push("dnd_off");
  if (!parsed.adb_keyboard_installed)
    parsed.issues.push("adb_keyboard_missing");
  if (parsed.stay_on_plugged < 3) parsed.issues.push("stay_on_not_set");

  console.log(
    `[Preset:Scan] ${serial.substring(0, 6)} — ${parsed.model} / Android ${parsed.android_version} / Battery ${parsed.battery_level}% / Issues: ${parsed.issues.length > 0 ? parsed.issues.join(", ") : "NONE ✅"}`
  );

  return parsed;
}

// ════════════════════════════════════════════════════════════
//  PRESET: OPTIMIZE
// ════════════════════════════════════════════════════════════
async function optimize(xiaowei, serial, options = {}) {
  const log = [];
  const cmds = [
    // 화면 회전
    {
      cmd: "settings put system accelerometer_rotation 0",
      desc: "자동회전 끄기",
    },
    { cmd: "settings put system user_rotation 0", desc: "세로 고정" },

    // 화면 유지
    {
      cmd: "settings put system screen_off_timeout 2147483647",
      desc: "화면 꺼짐 방지 (MAX)",
    },
    { cmd: "svc power stayon usb", desc: "USB 연결 시 화면 유지" },

    // 밝기
    {
      cmd: "settings put system screen_brightness_mode 0",
      desc: "밝기 자동조절 끄기",
    },
    { cmd: "settings put system screen_brightness 0", desc: "밝기 최소" },

    // 오디오
    { cmd: "media volume --stream 3 --set 0", desc: "미디어 볼륨 0" },
    { cmd: "media volume --stream 1 --set 0", desc: "벨소리 볼륨 0" },
    { cmd: "media volume --stream 5 --set 0", desc: "알림 볼륨 0" },

    // 방해금지
    { cmd: "settings put global zen_mode 1", desc: "DND 모드 켜기" },

    // 해상도 (Galaxy S9+)
    { cmd: "wm size 1080x1920", desc: "해상도 1080x1920" },
    { cmd: "wm density 420", desc: "밀도 420dpi" },

    // 애니메이션 끄기
    {
      cmd: "settings put global window_animation_scale 0",
      desc: "창 애니메이션 끄기",
    },
    {
      cmd: "settings put global transition_animation_scale 0",
      desc: "전환 애니메이션 끄기",
    },
    {
      cmd: "settings put global animator_duration_scale 0",
      desc: "애니메이터 끄기",
    },

    // 시간
    { cmd: "settings put global auto_time 1", desc: "자동 시간 설정" },
    { cmd: "setprop persist.sys.timezone Asia/Seoul", desc: "시간대 서울" },

    // 화면 깨우기
    { cmd: "input keyevent KEYCODE_WAKEUP", desc: "화면 깨우기" },
  ];

  console.log(
    `[Preset:Optimize] ${serial.substring(0, 6)} — Starting (${cmds.length} commands)`
  );

  for (const item of cmds) {
    try {
      await runAdbShell(xiaowei, serial, item.cmd);
      log.push({ desc: item.desc, status: "ok" });
      console.log(`  ✓ ${item.desc}`);
    } catch (err) {
      log.push({ desc: item.desc, status: "error", error: err.message });
      console.warn(`  ✗ ${item.desc}: ${err.message}`);
    }
    await sleep(250);
  }

  // ADBKeyboard 기본 입력기 전환
  if (options.setAdbKeyboard !== false) {
    try {
      const pkgRes = await runAdbShell(xiaowei, 
        serial,
        "pm list packages com.android.adbkeyboard"
      );
      const pkgVal = extractDeviceOutput(pkgRes, serial);
      if (pkgVal.includes("com.android.adbkeyboard")) {
        await runAdbShell(xiaowei, 
          serial,
          "ime enable com.android.adbkeyboard/.AdbIME"
        );
        await sleep(200);
        await runAdbShell(xiaowei, 
          serial,
          "ime set com.android.adbkeyboard/.AdbIME"
        );
        log.push({
          desc: "ADBKeyboard 기본 입력기 전환",
          status: "ok",
        });
        console.log("  ✓ ADBKeyboard 기본 입력기 전환");
      } else {
        log.push({
          desc: "ADBKeyboard 미설치 — 스킵",
          status: "skip",
        });
        console.log("  ⚠ ADBKeyboard 미설치 — 스킵");
      }
    } catch (err) {
      log.push({
        desc: "ADBKeyboard 전환 실패",
        status: "error",
        error: err.message,
      });
    }
  }

  const okCount = log.filter((l) => l.status === "ok").length;
  const errCount = log.filter((l) => l.status === "error").length;
  console.log(
    `[Preset:Optimize] ${serial.substring(0, 6)} — Done (${okCount} ok, ${errCount} errors)\n`
  );

  return { serial, log, ok: okCount, errors: errCount };
}

// ════════════════════════════════════════════════════════════
//  PRESET: YT_TEST
// ════════════════════════════════════════════════════════════
async function ytTest(xiaowei, serial, options = {}) {
  const result = { serial, pass: false, steps: [], errors: [] };

  const step = (name, ok, detail) => {
    result.steps.push({ name, ok, detail: detail || "" });
    if (!ok) result.errors.push(`${name}: ${detail || "failed"}`);
    console.log(
      `[Preset:YtTest] ${serial.substring(0, 6)} ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`
    );
    return ok;
  };

  try {
    // 1. YouTube 종료 + 실행
    await runAdbShell(xiaowei, serial, "am force-stop com.google.android.youtube");
    await sleep(1000);
    await runAdbShell(xiaowei, 
      serial,
      "monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1"
    );
    await sleep(_randInt(4000, 6000));

    // 2. foreground 확인
    const focusRes = await runAdbShell(xiaowei,
      serial,
      "dumpsys window | grep mCurrentFocus"
    );
    const focus = extractDeviceOutput(focusRes, serial);
    if (
      !step(
        "YouTube foreground",
        focus.toLowerCase().includes("youtube"),
        focus.substring(0, 60)
      )
    ) {
      return result;
    }

    // 3. UI dump → 검색 버튼 확인
    await runAdbShell(xiaowei, 
      serial,
      "uiautomator dump /sdcard/window_dump.xml"
    );
    await sleep(2000);
    const dumpRes = await runAdbShell(xiaowei,
      serial,
      "cat /sdcard/window_dump.xml"
    );
    const dump = extractDeviceOutput(dumpRes, serial);
    const hasSearch =
      dump.includes("검색") ||
      dump.includes("Search") ||
      dump.includes("search_button");
    step("검색 버튼 존재", hasSearch);

    // 4. 검색 버튼 터치 (bounds에서 좌표 추출)
    const searchMatch = dump.match(
      /content-desc="[^"]*검색[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/
    );
    const searchMatchAlt = dump.match(
      /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*content-desc="[^"]*검색[^"]*"/
    );
    const sm = searchMatch || searchMatchAlt;
    if (sm) {
      const cx = Math.round((parseInt(sm[1]) + parseInt(sm[3])) / 2);
      const cy = Math.round((parseInt(sm[2]) + parseInt(sm[4])) / 2);
      await runAdbShell(xiaowei, serial, `input tap ${cx} ${cy}`);
      step("검색 버튼 터치", true, `(${cx},${cy})`);
    } else {
      // 폴백: 우측 상단
      await runAdbShell(xiaowei, serial, "input tap 930 80");
      step("검색 버튼 터치 (폴백)", true, "(930,80)");
    }
    await sleep(2000);

    // 5. 텍스트 입력
    await runAdbShell(xiaowei, serial, "input text 'lofi%shiphop'");
    await sleep(800);
    await runAdbShell(xiaowei, serial, "input keyevent KEYCODE_ENTER");
    step("검색어 입력", true, "lofi hiphop");
    await sleep(_randInt(3000, 5000));

    // 6. 첫 번째 결과 터치
    await runAdbShell(xiaowei, 
      serial,
      "uiautomator dump /sdcard/window_dump.xml"
    );
    await sleep(2000);
    const dump2Res = await runAdbShell(xiaowei,
      serial,
      "cat /sdcard/window_dump.xml"
    );
    const dump2 = extractDeviceOutput(dump2Res, serial);
    const videoMatch = dump2.match(
      /resource-id="com\.google\.android\.youtube:id\/video_title"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/
    );
    if (videoMatch) {
      const cx = Math.round(
        (parseInt(videoMatch[1]) + parseInt(videoMatch[3])) / 2
      );
      const cy = Math.round(
        (parseInt(videoMatch[2]) + parseInt(videoMatch[4])) / 2
      );
      await runAdbShell(xiaowei, serial, `input tap ${cx} ${cy}`);
      step("검색 결과 터치", true, `(${cx},${cy})`);
    } else {
      await runAdbShell(xiaowei, serial, "input tap 540 770");
      step("검색 결과 터치 (폴백)", true, "(540,770)");
    }
    await sleep(_randInt(5000, 8000));

    // 7. 재생 상태 확인
    const mediaRes = await runAdbShell(xiaowei,
      serial,
      "dumpsys media_session | grep -E 'state='"
    );
    const media = extractDeviceOutput(mediaRes, serial);
    const isPlaying = media.includes("state=3");
    step("재생 상태", isPlaying, isPlaying ? "Playing ✓" : media.substring(0, 60));

    // 8. 20초 시청
    if (isPlaying) {
      console.log(
        `[Preset:YtTest] ${serial.substring(0, 6)} Watching 20s...`
      );
      await sleep(20000);
      step("20초 시청 완료", true);
    }

    // 9. 정리
    await runAdbShell(xiaowei, serial, "am force-stop com.google.android.youtube");
    await runAdbShell(xiaowei, serial, "input keyevent KEYCODE_HOME");

    result.pass = isPlaying;
  } catch (err) {
    result.errors.push(`Exception: ${err.message}`);
    try {
      await runAdbShell(xiaowei, serial, "input keyevent KEYCODE_HOME");
    } catch {}
  }

  console.log(
    `[Preset:YtTest] ${serial.substring(0, 6)} — ${result.pass ? "PASS ✅" : "FAIL ❌"} (${result.errors.length} errors)`
  );
  return result;
}

// ════════════════════════════════════════════════════════════
//  PRESET: WARMUP
// ════════════════════════════════════════════════════════════
async function warmup(xiaowei, serial, options = {}) {
  const durationSec = options.durationSec || _randInt(120, 300);
  const result = { serial, videosWatched: 0, totalSec: 0, errors: [] };

  console.log(
    `[Preset:Warmup] 🔥 ${serial.substring(0, 6)} Starting (target: ${durationSec}s)`
  );

  try {
    // 1. YouTube 실행
    await runAdbShell(xiaowei, serial, "am force-stop com.google.android.youtube");
    await sleep(1000);
    await runAdbShell(xiaowei, 
      serial,
      "monkey -p com.google.android.youtube -c android.intent.category.LAUNCHER 1"
    );
    await sleep(_randInt(3000, 5000));

    // 2. 화면 크기
    const sizeMatch = sizeVal.match(/(\d+)x(\d+)/);
    const w = sizeMatch ? parseInt(sizeMatch[1]) : 1080;
    const h = sizeMatch ? parseInt(sizeMatch[2]) : 1920;
    const midX = Math.round(w / 2);

    // 3. 홈 피드 스크롤
    for (let i = 0; i < _randInt(2, 4); i++) {
      await runAdbShell(xiaowei, 
        serial,
        `input swipe ${midX} ${Math.round(h * 0.7)} ${midX} ${Math.round(h * 0.3)} ${_randInt(500, 900)}`
      );
      await sleep(_randInt(1500, 3000));
    }

    const startTime = Date.now();
    const targetMs = durationSec * 1000;

    // 4. 랜덤 영상 시청
    while (Date.now() - startTime < targetMs && result.videosWatched < 5) {
      const tapY = Math.round(h * (_randInt(35, 65) / 100));
      await runAdbShell(xiaowei, serial, `input tap ${midX} ${tapY}`);
      await sleep(_randInt(3000, 5000));

      const watchMs = Math.min(
        _randInt(30, 90) * 1000,
        targetMs - (Date.now() - startTime)
      );
      if (watchMs <= 5000) break;

      let watched = 0;
      while (watched < watchMs) {
        await sleep(5000);
        watched += 5000;
        if (watched % 30000 < 5000) {
          await runAdbShell(xiaowei, serial, "input keyevent KEYCODE_WAKEUP");
        }
      }

      result.videosWatched++;
      console.log(
        `[Preset:Warmup] ${serial.substring(0, 6)} Watched #${result.videosWatched} (${Math.round(watchMs / 1000)}s)`
      );

      // 뒤로 → 스크롤
      await runAdbShell(xiaowei, serial, "input keyevent KEYCODE_BACK");
      await sleep(_randInt(1500, 2500));
      await runAdbShell(xiaowei, 
        serial,
        `input swipe ${midX} ${Math.round(h * 0.7)} ${midX} ${Math.round(h * 0.3)} ${_randInt(500, 900)}`
      );
      await sleep(_randInt(1500, 2500));
    }

    await runAdbShell(xiaowei, serial, "input keyevent KEYCODE_HOME");
    result.totalSec = Math.round((Date.now() - startTime) / 1000);
  } catch (err) {
    result.errors.push(err.message);
  }

  console.log(
    `[Preset:Warmup] ✓ ${serial.substring(0, 6)} Done (${result.videosWatched} videos, ${result.totalSec}s)`
  );
  return result;
}

// ════════════════════════════════════════════════════════════
//  PRESET: INSTALL_APKS
// ════════════════════════════════════════════════════════════
async function installApks(xiaowei, serial, options = {}) {
  const apks = [
    {
      name: "XWKeyboard (ADB Keyboard)",
      path:
        options.xwKeyboardPath ||
        path.join(XIAOWEI_TOOLS_DIR, 'XWKeyboard.apk'),
      package: "com.android.adbkeyboard",
      postInstall: [
        "ime enable com.android.adbkeyboard/.AdbIME",
        "ime set com.android.adbkeyboard/.AdbIME",
      ],
    },
    {
      name: "Assistant",
      path:
        options.assistantPath ||
        path.join(XIAOWEI_TOOLS_DIR, 'assistant.apk'),
      package: null,
    },
    {
      name: "HID Manager",
      path:
        options.hidmanagerPath ||
        path.join(XIAOWEI_TOOLS_DIR, 'hidmanager.apk'),
      package: null,
    },
  ];

  const results = [];

  for (const apk of apks) {
    console.log(
      `[Preset:Install] ${serial.substring(0, 6)} Installing ${apk.name}...`
    );

    // 이미 설치 확인
    if (apk.package) {
      try {
        const pkgRes = await runAdbShell(xiaowei, 
          serial,
          `pm list packages ${apk.package}`
        );
        const pkgVal = extractDeviceOutput(pkgRes, serial);
        if (pkgVal.includes(apk.package)) {
          console.log(
            `[Preset:Install] ${serial.substring(0, 6)} ${apk.name} already installed ✓`
          );
          results.push({ name: apk.name, status: "already_installed" });
          continue;
        }
      } catch {}
    }

    // 설치
    try {
      await xiaowei.installApk(serial, apk.path);
      await sleep(15000); // 설치 대기

      // 후속 명령
      if (apk.postInstall) {
        for (const cmd of apk.postInstall) {
          await runAdbShell(xiaowei, serial, cmd);
          await sleep(500);
        }
      }

      results.push({ name: apk.name, status: "installed" });
      console.log(
        `[Preset:Install] ${serial.substring(0, 6)} ${apk.name} installed ✓`
      );
    } catch (err) {
      results.push({ name: apk.name, status: "error", error: err.message });
      console.warn(
        `[Preset:Install] ${serial.substring(0, 6)} ${apk.name} failed: ${err.message}`
      );
    }
  }

  return { serial, results };
}

// ════════════════════════════════════════════════════════════
//  PRESET: INIT (최초 등록 = scan + optimize + install + yttest)
// ════════════════════════════════════════════════════════════
async function init(xiaowei, serial, supabase, pcId) {
  console.log(
    `[Preset:Init] ${serial.substring(0, 6)} — Starting full initialization`
  );

  // 1. Scan
  const scanResult = await scan(xiaowei, serial);

  // 2. DB 등록
  if (supabase && pcId) {
    try {
      await supabase
        .from("devices")
        .upsert(
          {
            serial_number: serial,
            model: scanResult.model,
            pc_id: pcId,
            status: "initializing",
            battery_level: scanResult.battery_level,
          },
          { onConflict: "serial_number" }
        );
    } catch (err) {
      console.warn(`[Preset:Init] DB upsert error: ${err.message}`);
    }
  }

  // 3. APK 설치
  const installResult = await installApks(xiaowei, serial);

  // 4. 최적화
  const optResult = await optimize(xiaowei, serial);

  // 5. YouTube 테스트
  const testResult = await ytTest(xiaowei, serial);

  // 6. DB 상태 업데이트
  const finalStatus = testResult.pass ? "online" : "error";
  if (supabase) {
    try {
      await supabase
        .from("devices")
        .update({
          status: finalStatus,
          last_heartbeat: new Date().toISOString(),
        })
        .eq("serial_number", serial);
    } catch (err) {
      console.warn(`[Preset:Init] DB update error: ${err.message}`);
    }
  }

  console.log(
    `[Preset:Init] ${serial.substring(0, 6)} — Complete (${finalStatus})`
  );

  return {
    serial,
    status: finalStatus,
    scan: scanResult,
    install: installResult,
    optimize: optResult,
    ytTest: testResult,
  };
}

// ════════════════════════════════════════════════════════════
module.exports = {
  scan,
  optimize,
  ytTest,
  warmup,
  installApks,
  init,
};
