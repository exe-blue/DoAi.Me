/**
 * Xiaowei response codes (docs/xiaowei_client.md §2.3, §8.2).
 * Used by apps/desktop/adb when core is not in the require path.
 */
const XIAOWEI_RESPONSE_CODE_SUCCESS = 10000;
const XIAOWEI_RESPONSE_CODE_FAILURE = 10001;

function isXiaoweiFailure(res) {
  return res && res.code === XIAOWEI_RESPONSE_CODE_FAILURE;
}

module.exports = {
  XIAOWEI_RESPONSE_CODE_SUCCESS,
  XIAOWEI_RESPONSE_CODE_FAILURE,
  isXiaoweiFailure,
};
