/**
 * task-executor.js 에 추가할 upload_file 핸들러 패치
 *
 * 기존 task-executor.js의 switch(task_type) 안에 아래 케이스를 추가
 *
 * 운영: devices="all" 사용 금지. target_devices 없으면 해당 PC 디바이스 목록으로 자동 채움.
 */

// ─── 기존 switch 안에 추가 ────────────────────────────────────

case 'upload_file': {
  const { devices, local_path, remote_path, is_media = '0' } = payload;

  if (!local_path) throw new Error('payload.local_path is required for upload_file');
  if (!remote_path) throw new Error('payload.remote_path is required for upload_file');

  // remote_path의 디렉토리가 없을 수 있으므로 먼저 mkdir
  const remoteDir = remote_path.substring(0, remote_path.lastIndexOf('/'));
  if (remoteDir) {
    await xiaoweiClient.adb_shell(
      task.pc_id || nodeId,
      devices,
      `mkdir -p ${remoteDir}`
    );
  }

  // Xiaowei uploadFile 전송
  const result = await xiaoweiClient.upload_file(
    task.pc_id || nodeId,
    devices,
    local_path,
    remote_path,
    is_media
  );

  log.info(`[upload_file] ${local_path} → ${remote_path} | devices=${devices}`);
  return { success: true, task_type: 'upload_file', local_path, remote_path, result };
}

// ─── XiaoweiClient에 upload_file 메서드 추가 ─────────────────
// xiaowei-client.js (또는 .ts) 에 아래 메서드 추가

/*
async upload_file(nodeId, devices, localPath, remotePath, isMedia = '0') {
  return await this.send_command(nodeId, 'uploadFile', devices, {
    filePath: localPath,
    remotePath: remotePath,   // Xiaowei가 remotePath 파라미터 지원하는 경우
    isMedia: isMedia,
  });
}
*/

// ─── 사용 예 ──────────────────────────────────────────────────
/*
// 1. Vercel API로 배포 요청
POST /api/youtube/deploy
{
  "script_name": "youtube_commander",   // 또는 "youtube_commander_run"
  "pc_id": "PC01"                       // 특정 PC만, 없으면 전체
}

// 2. 전체 스크립트 한 번에 배포
POST /api/youtube/deploy
{
  "deploy_all": true,
  "pc_id": "<uuid>"
}

// 3. 커스텀 경로 직접 지정
POST /api/youtube/deploy
{
  "local_path": "./scripts/youtube_commander.js",
  "remote_path": "/sdcard/scripts/youtube_commander.js",
  "devices": "group:PC01"
}

// 4. 배포 후 바로 실행 (pipeline 조합)
// Step 1: deploy
POST /api/youtube/deploy { "script_name": "youtube_commander" }
// Step 2: 영상 실행
POST /api/youtube/command { "command": { "action": "launch", "params": { "fromScratch": true } } }
*/
