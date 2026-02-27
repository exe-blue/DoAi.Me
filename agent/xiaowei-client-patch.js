/**
 * agent/xiaowei-client.js 에 추가할 메서드 패치
 *
 * 기존 uploadFile() 메서드 아래에 아래 3개 추가
 */

// ─── 추가할 메서드들 ────────────────────────────────────────────

/**
 * AutoX.js 스크립트 실행
 * @param {string} devices  "all" | "serial1,serial2"
 * @param {string} scriptPath  Node PC 로컬 절대경로 (예: "D:\\scripts\\youtube_commander.js")
 * @param {number} count  실행 횟수 (0 = 무한)
 * @param {number[]} taskInterval  [최소ms, 최대ms]
 * @param {number} deviceInterval  디바이스 간 간격(ms)
 */
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

/**
 * 실행 중인 AutoX.js 스크립트 중지
 * @param {string} devices
 * @param {string} scriptName  파일명만 (예: "youtube_commander.js")
 */
async autojsRemove(devices, scriptName) {
  return await this.send({
    action: 'autojsRemove',
    devices,
    data: { name: scriptName }
  });
}

/**
 * 등록된 AutoX.js 작업 목록 조회
 */
async autojsTasks() {
  return await this.send({ action: 'autojsTasks' });
}

/**
 * 디바이스에서 파일 pull (ADB)
 * @param {string} deviceSerial  단일 시리얼
 * @param {string} remotePath  디바이스 경로
 * @param {string} localPath   Node PC 로컬 저장 경로
 */
async pullFile(deviceSerial, remotePath, localPath) {
  const { execFile } = require('child_process');
  return new Promise((resolve, reject) => {
    execFile('adb', ['-s', deviceSerial, 'pull', remotePath, localPath],
      { timeout: 10000 },
      (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      }
    );
  });
}