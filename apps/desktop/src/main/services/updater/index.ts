/**
 * electron-updater: check on startup, no forced install. Phase D.
 */
import { autoUpdater } from "electron-updater";
import log from "electron-log";

autoUpdater.logger = log;

export function initUpdater(): void {
  autoUpdater.checkForUpdatesAndNotify().catch((e) => log.warn("[Updater] Check failed", e));
}
