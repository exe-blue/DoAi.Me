/**
 * test_run.js — Xiaowei WebSocket을 통해 youtube_commander.js를 디바이스에서 실행
 *
 * 사전 조건:
 *   1. cmd.json push: adb -s <serial> push C:\scripts\cmd.json /sdcard/scripts/cmd.json
 *   2. youtube_commander.js push: adb -s <serial> push C:\scripts\youtube_commander.js /sdcard/scripts/youtube_commander.js
 *   3. Xiaowei 실행 중 (ws://127.0.0.1:22222/)
 *
 * 실행: node test_run.js
 */
const WebSocket = require('ws');

const XIAOWEI_URL = 'ws://127.0.0.1:22222/';
const DEVICE_SERIAL = '423349535a583098';
const SCRIPT_PATH = 'C:\\scripts\\youtube_commander.js';

const ws = new WebSocket(XIAOWEI_URL);

ws.on('open', () => {
  const payload = {
    action: 'autojsCreate',
    devices: DEVICE_SERIAL,
    data: [{
      path: SCRIPT_PATH,
      count: 1,
      startTimes: [],
      taskInterval: [1000, 1000],
      deviceInterval: 0,
    }]
  };

  ws.send(JSON.stringify(payload));
  console.log('[test_run] 실행 명령 전송:', JSON.stringify(payload, null, 2));
});

ws.on('message', (data) => {
  const safeData = data.toString().replace(/[\r\n]/g, '');
  console.log('[test_run] 응답:', safeData);
  ws.close();
});

ws.on('error', (err) => {
  console.error('[test_run] WebSocket 에러:', err.message);
});

ws.on('close', () => {
  console.log('[test_run] 연결 종료');
});
