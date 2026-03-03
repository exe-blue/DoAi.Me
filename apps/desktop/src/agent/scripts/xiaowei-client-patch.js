/**
 * Xiaowei client extensions (docs/xiaowei_ws_api).
 *
 * autojsCreate, autojsRemove, autojsTasks, pullFile are implemented in
 * core/xiaowei-client.js. This file re-exports the core client so scripts
 * that required this "patch" keep working. Do not use child_process/adb
 * here; all device I/O goes through Xiaowei WebSocket.
 */
const XiaoweiClient = require("../core/xiaowei-client");

module.exports = XiaoweiClient;
