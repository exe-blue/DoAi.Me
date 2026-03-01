/**
 * Resolve hardware serial for TCP/IP (IP:PORT) connected devices.
 * When connected via adb connect IP:5555, Xiaowei list() shows IP:5555 as the identifier.
 * This module uses getprop ro.serialno (Galaxy S9 etc.) to get the real hardware serial.
 * Used so the DB can identify devices by serial_number even when IP changes.
 */
const SERIALNO_PROP = "ro.serialno";
const RIL_SERIAL_PROP = "ril.serialnumber";
const RESOLVE_TIMEOUT_MS = 5000;

function isIpPortIdentifier(deviceId) {
  if (!deviceId || typeof deviceId !== "string") return false;
  const trimmed = deviceId.trim();
  if (!trimmed) return false;
  const parts = trimmed.split(":");
  if (parts.length !== 2) return false;
  const port = parseInt(parts[1], 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;
  return true;
}

function extractSerialFromResponse(response) {
  if (!response) return null;
  let raw = null;
  if (typeof response.data === "string") raw = response.data;
  else if (response.data && typeof response.data.result === "string") raw = response.data.result;
  else if (response.data && typeof response.data === "object") {
    raw = response.data.result ?? response.data.data ?? response.data.output ?? null;
  }
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length > 0 ? s : null;
}

/**
 * Resolve hardware serial for a single device via adb shell getprop.
 * @param {import('../core/xiaowei-client')} xiaowei
 * @param {string} deviceId - Connection identifier (IP:5555 or serial)
 * @returns {Promise<string|null>}
 */
async function resolveHardwareSerial(xiaowei, deviceId) {
  if (!xiaowei || !xiaowei.adbShell) return null;
  if (!deviceId || !deviceId.trim()) return null;
  const props = [SERIALNO_PROP, RIL_SERIAL_PROP];
  for (const prop of props) {
    try {
      const res = await Promise.race([
        xiaowei.adbShell(deviceId, `getprop ${prop}`),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), RESOLVE_TIMEOUT_MS)
        ),
      ]);
      const serial = extractSerialFromResponse(res);
      if (serial) return serial;
    } catch (_) {
      continue;
    }
  }
  return null;
}

/**
 * For each device whose .serial looks like IP:PORT, resolve hardware serial.
 * Returns list with .serial = hardware serial, .connectionId = original id (for Xiaowei targeting).
 * @param {import('../core/xiaowei-client')} xiaowei
 * @param {Array<{serial: string, [key: string]: any}>} deviceList
 * @returns {Promise<Array<{serial: string, connectionId?: string, [key: string]: any}>>}
 */
async function resolveHardwareSerialsForList(xiaowei, deviceList) {
  if (!deviceList || deviceList.length === 0) return deviceList;
  const out = [];
  for (const dev of deviceList) {
    const connectionId = dev.serial || "";
    if (isIpPortIdentifier(connectionId)) {
      const hardwareSerial = await resolveHardwareSerial(xiaowei, connectionId);
      if (hardwareSerial) {
        out.push({ ...dev, serial: hardwareSerial, connectionId });
      } else {
        out.push({ ...dev, connectionId });
      }
    } else {
      out.push(dev);
    }
  }
  return out;
}

module.exports = {
  isIpPortIdentifier,
  resolveHardwareSerial,
  resolveHardwareSerialsForList,
  extractSerialFromResponse,
};
