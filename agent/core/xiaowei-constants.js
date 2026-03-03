/**
 * Xiaowei WebSocket API response codes and device targeting constants.
 * Response envelope and codes: docs/xiaowei_client.md §2.3, §8.2.
 * Device targeting: docs/xiaowei_client.md §3.
 * Action catalog: docs/xiaowei_client.md §4.
 */

/** Success (docs/xiaowei_client.md §8.2) */
const XIAOWEI_RESPONSE_CODE_SUCCESS = 10000;
/** Failure (docs/xiaowei_client.md §8.2) */
const XIAOWEI_RESPONSE_CODE_FAILURE = 10001;

/** Target all connected devices (docs/xiaowei_client.md §3) */
const XIAOWEI_DEVICES_ALL = "all";

/**
 * @param {{ code?: number }} res - Xiaowei response object
 * @returns {boolean}
 */
function isXiaoweiSuccess(res) {
  return res && res.code === XIAOWEI_RESPONSE_CODE_SUCCESS;
}

/**
 * @param {{ code?: number }} res - Xiaowei response object
 * @returns {boolean}
 */
function isXiaoweiFailure(res) {
  return res && res.code === XIAOWEI_RESPONSE_CODE_FAILURE;
}

/** Action names sent to Xiaowei (docs/xiaowei_client.md §4 Action Catalog) */
const XIAOWEI_ACTIONS = {
  list: "list",
  updateDevices: "updateDevices",
  xiaoweiAdb: "xiaowei.adb",
  adb_shell: "adb_shell",
  screen: "screen",
  pointerEvent: "pointerEvent",
  pushEvent: "pushEvent",
  writeClipBoard: "writeClipBoard",
  uploadFile: "uploadFile",
  pullFile: "pullFile",
  apkList: "apkList",
  installApk: "installApk",
  uninstallApk: "uninstallApk",
  startApk: "startApk",
  stopApk: "stopApk",
  imeList: "imeList",
  installInputIme: "installInputIme",
  selectIme: "selectIme",
  inputText: "inputText",
  getTags: "getTags",
  addTag: "addTag",
  updateTag: "updateTag",
  removeTag: "removeTag",
  addTagDevice: "addTagDevice",
  removeTagDevice: "removeTagDevice",
  actionTasks: "actionTasks",
  actionCreate: "actionCreate",
  actionRemove: "actionRemove",
  autojsTasks: "autojsTasks",
  autojsCreate: "autojsCreate",
  autojsRemove: "autojsRemove",
};

module.exports = {
  XIAOWEI_RESPONSE_CODE_SUCCESS,
  XIAOWEI_RESPONSE_CODE_FAILURE,
  XIAOWEI_DEVICES_ALL,
  XIAOWEI_ACTIONS,
  isXiaoweiSuccess,
  isXiaoweiFailure,
};
