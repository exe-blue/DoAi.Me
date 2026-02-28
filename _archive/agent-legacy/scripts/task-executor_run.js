/**
 * agent/task-executor.js 패치
 *
 * 1. 파일 상단 require 섹션에 추가:
 *    const fs   = require('fs');
 *    const os   = require('os');
 *    const path = require('path');
 *
 * 2. config 로드 후 아래 상수 추가:
 *    const SCRIPT_PATH = path.join(
 *      process.env.SCRIPTS_DIR || path.join(__dirname, '..', 'scripts'),
 *      'youtube_commander.js'
 *    );
 *
 * 3. switch(task.task_type) 안에 아래 케이스 추가
 */

// ─── switch(task.task_type) 안에 추가 ──────────────────────────

case 'run_script': {
  // devices: from task.target_devices (connection_id ?? serial). 운영 금지: "all"
  const {
    devices,
    script_path = SCRIPT_PATH,          // 기본값: SCRIPTS_DIR/youtube_commander.js
    cmd,                                // 단일 커맨드
    commands,                           // 파이프라인
    step_delay = 500,
    count = 1,
    task_interval = [500, 1500],
    device_interval = 500,
  } = task.payload;

  if (!cmd && !commands) {
    throw new Error('payload.cmd 또는 payload.commands 가 필요합니다');
  }

  // ── Step 1: cmd.json 생성 → 디바이스 업로드 ──────────────────
  const cmdData = commands
    ? { commands, stepDelay: step_delay }
    : { ...cmd };

  const tmpDir    = os.tmpdir();
  const cmdPath   = path.join(tmpDir, `yt_cmd_${Date.now()}.json`);
  fs.writeFileSync(cmdPath, JSON.stringify(cmdData), 'utf8');

  try {
    await xiaowei.uploadFile(
      devices,
      cmdPath,
      '/sdcard/scripts/cmd.json',
      '0'
    );
  } finally {
    fs.unlinkSync(cmdPath); // 임시 파일 항상 정리
  }

  console.log(`[run_script] cmd.json 업로드 완료:`, cmdData);
  await new Promise(r => setTimeout(r, 400)); // 업로드 안착 대기

  // ── Step 2: autojsCreate로 스크립트 실행 ─────────────────────
  const autojsRes = await xiaowei.autojsCreate(
    devices,
    script_path,
    count,
    task_interval,
    device_interval
  );
  console.log(`[run_script] autojsCreate 응답:`, autojsRes);

  // ── Step 3: result.json 폴링 (최대 90초) ─────────────────────
  // 첫 번째 타겟만 대표로 결과 수집
  const firstSerial = devices ? devices.split(',')[0].trim() : null;
  let scriptResult  = null;

  if (firstSerial) {
    const resultRemote = '/sdcard/scripts/result.json';
    const resultLocal  = path.join(tmpDir, `yt_result_${Date.now()}.json`);
    const deadline     = Date.now() + 90000;

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        await xiaowei.pullFile(firstSerial, resultRemote, resultLocal);
        scriptResult = JSON.parse(fs.readFileSync(resultLocal, 'utf8'));
        fs.unlinkSync(resultLocal);
        // 디바이스에서 result.json 삭제
        await xiaowei.adbShell(firstSerial, `rm -f ${resultRemote}`);
        console.log(`[run_script] 결과 수신:`, scriptResult);
        break;
      } catch (e) {
        // result.json 아직 없음 → 계속 대기
      }
    }

    if (!scriptResult) {
      console.warn('[run_script] result.json 타임아웃 — 스크립트가 완료되지 않았거나 결과 없음');
    }
  } else {
    console.log('[run_script] No representative device: result polling skipped');
    await new Promise(r => setTimeout(r, 5000));
  }

  return {
    success: true,
    task_type: 'run_script',
    devices,
    script_path,
    cmd: cmdData,
    autojs: autojsRes,
    result: scriptResult,
  };
}

case 'stop_script': {
  const { devices, script_name = 'youtube_commander.js' } = task.payload;  // devices from task.target_devices
  const res = await xiaowei.autojsRemove(devices, script_name);
  console.log(`[stop_script] autojsRemove:`, res);
  return { success: true, task_type: 'stop_script', devices, script_name, res };
}