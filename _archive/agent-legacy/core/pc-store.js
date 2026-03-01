/**
 * DoAi.Me Agent - Local PC identity store (file-based)
 * Persists pc_number so the agent reuses the same PC on subsequent runs.
 * When Electron is added, the same flow can use electron-store
 * (path: Windows C:\Users\[user]\AppData\Roaming\DoAi Agent\config.json).
 */
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.resolve(__dirname, "..", "data");
const PC_JSON_PATH = path.join(DATA_DIR, "pc.json");

/**
 * Read saved pc_number from local store (sync).
 * @returns {string|null} e.g. "PC-01" or null if not saved
 */
function getSavedPcNumber() {
  try {
    const raw = fs.readFileSync(PC_JSON_PATH, "utf8");
    const data = JSON.parse(raw);
    const pcNumber =
      typeof data.pcNumber === "string" && data.pcNumber.trim()
        ? data.pcNumber.trim()
        : null;
    return pcNumber || null;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    console.warn(`[PCStore] Read failed: ${err.message}`);
    return null;
  }
}

/**
 * Write pc_number to local store (sync). Ensures directory exists.
 * @param {string} pcNumber - e.g. "PC-01"
 */
function setSavedPcNumber(pcNumber) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = { pcNumber: String(pcNumber).trim() };
    fs.writeFileSync(PC_JSON_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`[PCStore] Write failed: ${err.message}`);
    throw err;
  }
}

module.exports = {
  getSavedPcNumber,
  setSavedPcNumber,
  PC_JSON_PATH,
  DATA_DIR,
};
