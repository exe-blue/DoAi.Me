/**
 * Shared Xiaowei response parsing utilities.
 */

function _toText(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * Whether a Xiaowei response indicates immediate success.
 * queued responses are treated as a separate non-success state.
 * @param {any} res
 * @returns {boolean}
 */
function isSuccessResponse(res) {
  if (!res || typeof res !== "object") return false;
  if (res.queued) return false;
  return Number(res.code) === 10000;
}

/**
 * Extracts device output text from Xiaowei response.
 * Order:
 *  1) data[serial]
 *  2) first value from data object
 *  3) data as string
 *  4) stdout/msg/result/output fallback
 * @param {any} res
 * @param {string=} serial
 * @returns {string}
 */
function extractDeviceOutput(res, serial) {
  if (res == null) return "";
  if (typeof res === "string") return res.trim();
  if (typeof res !== "object") return _toText(res);

  const data = res.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (serial && data[serial] != null) return _toText(data[serial]);
    const vals = Object.values(data);
    if (vals.length > 0 && vals[0] != null) return _toText(vals[0]);
  }

  if (typeof data === "string") return data.trim();

  const fallbackKeys = ["stdout", "msg", "result", "output"];
  for (const key of fallbackKeys) {
    if (res[key] != null) return _toText(res[key]);
  }

  return "";
}

/**
 * Build a short log summary for Xiaowei response.
 * @param {any} res
 * @param {string=} serial
 * @returns {string}
 */
function summarizeResponse(res, serial) {
  if (res == null) return "empty-response";
  if (typeof res === "string") return res.substring(0, 120);
  if (typeof res !== "object") return String(res).substring(0, 120);

  if (res.queued) return "queued";

  const output = extractDeviceOutput(res, serial);
  if (output) return output.substring(0, 120);

  if (res.code !== undefined) return `code=${res.code}`;
  if (res.status !== undefined) return `status=${res.status}`;
  return "unparsed-response";
}

module.exports = {
  isSuccessResponse,
  extractDeviceOutput,
  summarizeResponse,
};
