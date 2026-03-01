/**
 * Screenshot on task complete: save to installDir (C:\client) with filename
 * 날짜_기기명_금일작업횟수 (YYYYMMDD_serial_dailyCount.png).
 * Uses ADB from xiaowei tools dir when on Windows.
 */
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import log from "electron-log";
import { getConfig } from "../../app/lifecycle";

const execFileAsync = promisify(execFile);

const COUNT_FILE = ".daily_screenshot_count.json";

interface DailyCountState {
  date: string;
  count: number;
}

function getScreenshotsDir(): string | null {
  const config = getConfig();
  const dir = config.screenshotsDir || config.installDir;
  if (!dir || typeof dir !== "string") return null;
  return path.resolve(dir);
}

function getAdbPath(): string | null {
  const config = getConfig();
  const toolsDir = config.xiaoweiToolsDir;
  if (!toolsDir || typeof toolsDir !== "string") return null;
  const adb = path.join(path.resolve(toolsDir), "adb.exe");
  if (!fs.existsSync(adb)) return null;
  return adb;
}

/** Sanitize device name for filename: replace : \ / with _. */
function sanitizeDeviceName(serial: string): string {
  return serial.replace(/[:\\/]/g, "_").replace(/\s/g, "_") || "device";
}

/**
 * Get and increment daily screenshot count for the given directory.
 * Persists in dir/.daily_screenshot_count.json.
 */
function getNextDailyCount(dir: string): number {
  const countPath = path.join(dir, COUNT_FILE);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  let state: DailyCountState = { date: today, count: 0 };
  try {
    if (fs.existsSync(countPath)) {
      const raw = fs.readFileSync(countPath, "utf8");
      const parsed = JSON.parse(raw) as DailyCountState;
      if (parsed.date === today) {
        state = { date: today, count: parsed.count + 1 };
      }
    }
  } catch (_) {
    state = { date: today, count: 1 };
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(countPath, JSON.stringify(state), "utf8");
  } catch (err) {
    log.warn("[Screenshot] Failed to write count file:", err);
  }
  return state.count;
}

/**
 * Take screenshot on device and save to dir with filename:
 * YYYYMMDD_기기명_금일작업횟수.png
 * Uses ADB from xiaowei tools (Windows). Returns saved path or null.
 */
export async function takeScreenshotOnComplete(deviceSerial: string): Promise<string | null> {
  if (process.platform !== "win32") return null;

  const dir = getScreenshotsDir();
  const adbPath = getAdbPath();
  if (!dir || !adbPath) return null;

  const dailyCount = getNextDailyCount(dir);
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const namePart = sanitizeDeviceName(deviceSerial);
  const filename = `${datePart}_${namePart}_${dailyCount}.png`;
  const fullPath = path.join(dir, filename);

  try {
    fs.mkdirSync(dir, { recursive: true });
    await execFileAsync(adbPath, ["-s", deviceSerial, "exec-out", "screencap", "-p"], {
      encoding: "buffer",
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }).then(({ stdout }) => {
      fs.writeFileSync(fullPath, stdout as Buffer);
    });
    log.info("[Screenshot] Saved:", fullPath);
    return fullPath;
  } catch (err) {
    log.warn("[Screenshot] Failed:", (err as Error).message);
    return null;
  }
}
