/**
 * DoAi.Me - Screenshot on watch complete
 * 시청 완료 시 디바이스 스크린샷 촬영 후 로컬 폴더에 저장.
 * 파일명: 날짜시간-그날작업갯수누적.png (예: 2026-02-28T14-30-00-003.png)
 */
const fs = require("fs");
const path = require("path");

/**
 * Ensure directory exists (mkdir -p style).
 * @param {string} dirPath
 */
function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
  }
}

/**
 * Take screenshot on device and save to logging dir.
 * Filename: YYYY-MM-DDTHH-mm-ss-NNN.png (NNN = that day's cumulative task count).
 * @param {import('../core/xiaowei-client')} xiaowei
 * @param {string} connectionTarget - Xiaowei device target (IP:5555 or serial)
 * @param {number} dailyCumulativeCount - 그날 작업 갯수 누적 (1-based)
 * @param {string} loggingDir - e.g. c:\logging
 * @returns {Promise<string|null>} Saved file path or null on failure
 */
async function takeScreenshotOnComplete(xiaowei, connectionTarget, dailyCumulativeCount, loggingDir) {
  if (!xiaowei || !connectionTarget || !loggingDir) return null;
  const now = new Date();
  const datePart = now.toISOString().slice(0, 19).replace(/:/g, "-");
  const countPart = String(dailyCumulativeCount).padStart(3, "0");
  const filename = `${datePart}-${countPart}.png`;
  const fullPath = path.resolve(loggingDir, filename);

  ensureDir(loggingDir);

  try {
    await xiaowei.screen(connectionTarget, fullPath);
    console.log(`[ScreenshotOnComplete] ${connectionTarget.substring(0, 8)} → ${fullPath}`);
    return fullPath;
  } catch (err) {
    console.warn(`[ScreenshotOnComplete] Failed: ${err.message}`);
    return null;
  }
}

module.exports = { takeScreenshotOnComplete, ensureDir };
