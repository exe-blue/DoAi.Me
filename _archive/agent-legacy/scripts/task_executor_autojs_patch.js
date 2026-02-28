/**
 * task-executor.js 패치 — autojsCreate 연동
 *
 * 기존 'upload_file' case 아래에 추가
 * xiaowei-client.js에 autojsCreate / autojsRemove 메서드도 추가
 *
 * 운영: devices="all" 사용 금지. target_devices 없으면 해당 PC 디바이스 목록으로 자동 채움.
 */

// ═══════════════════════════════════════════════════════════
// A. task-executor.js switch 안에 추가할 케이스들
// ═══════════════════════════════════════════════════════════

case 'run_script': {
  /**
   * payload 예시:
   * {
   *   devices: "serial1,serial2" (운영 금지: "all"),
   *   script_path: "D:\\scripts\\youtube_commander.js",  // Node PC 절대경로
   *   cmd: { action: "search", params: { query: "BTS" } },  // 단일 커맨드
   *   // 또는
   *   commands: [...],   // 파이프라인
   *   step_delay: 500,
   *   count: 1,
   *   task_interval: [500, 1000],
   *   device_interval: 500,
   * }
   */
  const {
    devices,  // no default "all"; filled from task.target_devices / PC devices
    script_path,
    cmd,
    commands,
    step_delay = 500,
    count = 1,
    task_interval = [500, 1500],
    device_interval = 500,
  } = payload;

  if (!script_path) throw new Error('payload.script_path required for run_script');
  if (!cmd && !commands) throw new Error('payload.cmd or payload.commands required');

  // 1. cmd.json 생성 후 디바이스에 업로드
  const cmdData = commands
    ? { commands, stepDelay: step_delay }
    : { ...cmd };

  const cmdJsonStr = JSON.stringify(cmdData);
  const tmpPath = path.join(os.tmpdir(), `cmd_${Date.now()}.json`);
  fs.writeFileSync(tmpPath, cmdJsonStr, 'utf8');

  await xiaowei.uploadFile(
    devices,
    tmpPath,
    '/sdcard/scripts/cmd.json',
    '0'
  );
  fs.unlinkSync(tmpPath); // 임시 파일 정리

  log.info(`[run_script] cmd.json uploaded: ${cmdJsonStr.slice(0, 80)}...`);
  sleep(300); // 업로드 완료 대기

  // 2. autojsCreate로 스크립트 실행
  const autojsResult = await xiaowei.autojsCreate(
    devices,
    script_path,
    count,
    task_interval,
    device_interval
  );

  log.info(`[run_script] autojsCreate sent: ${JSON.stringify(autojsResult)}`);

  // 3. result.json 폴링 (최대 60초 대기)
  const resultRemotePath = '/sdcard/scripts/result.json';
  const resultLocalPath = path.join(os.tmpdir(), `result_${Date.now()}.json`);
  let scriptResult = null;

  const pollDeadline = Date.now() + 60000;
  while (Date.now() < pollDeadline) {
    await sleep(2000);
    try {
      await xiaowei.pullFile(devices.split(',')[0], resultRemotePath, resultLocalPath);
      const raw = fs.readFileSync(resultLocalPath, 'utf8');
      scriptResult = JSON.parse(raw);
      // 결과 파일 삭제
      await xiaowei.adbShell(devices, `rm -f ${resultRemotePath}`);
      break;
    } catch(e) {
      // result.json 아직 없음 → 계속 대기
    }
  }

  return {
    success: true,
    task_type: 'run_script',
    script_path,
    devices,
    autojsResult,
    scriptResult,
  };
}

case 'stop_script': {
  /**
   * payload: { devices: "serial1,serial2" (no "all"), script_name: "youtube_commander.js" }
   */
  const { devices, script_name } = payload;  // devices from task.target_devices / PC list, no "all"
  if (!script_name) throw new Error('payload.script_name required');

  const result = await xiaowei.autojsRemove(devices, script_name);
  return { success: true, task_type: 'stop_script', result };
}


// ═══════════════════════════════════════════════════════════
// B. xiaowei-client.js 에 추가할 메서드들
// ═══════════════════════════════════════════════════════════

/*
// xiaowei-client.js

async autojsCreate(devices, scriptPath, count = 1, taskInterval = [500, 1500], deviceInterval = 500) {
  return await this.send({
    action: 'autojsCreate',
    devices,
    data: [{
      path: scriptPath,
      count,
      startTimes: [],
      taskInterval,
      deviceInterval,
    }]
  });
}

async autojsRemove(devices, scriptName) {
  return await this.send({
    action: 'autojsRemove',
    devices,
    data: { name: scriptName }
  });
}

async autojsTasks() {
  return await this.send({ action: 'autojsTasks' });
}

async pullFile(deviceSerial, remotePath, localPath) {
  // ADB pull 방식
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    execFile('adb', ['-s', deviceSerial, 'pull', remotePath, localPath], (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}
*/


// ═══════════════════════════════════════════════════════════
// C. Vercel API 사용 예시
// ═══════════════════════════════════════════════════════════

/*
// 검색 실행
POST /api/youtube/command
{
  "pc_id": "<uuid>",
  "command": {
    "action": "search",
    "params": { "query": "BTS Dynamite" }
  }
}

// Vercel route.ts에서 → Supabase insert:
{
  type: "youtube",
  task_type: "run_script",
  payload: {
    devices: "<resolved by server>",
    script_path: "C:\\scripts\\youtube_commander.js",
    cmd: { action: "search", params: { query: "BTS Dynamite" } }
  }
}

// 파이프라인 실행 (검색 → 클릭 → 좋아요)
POST /api/youtube/pipeline
{
  "commands": [
    { "action": "launch", "params": { "fromScratch": true } },
    { "action": "search", "params": { "query": "BTS Dynamite" } },
    { "action": "like" },
    { "action": "subscribe" }
  ]
}
*/
