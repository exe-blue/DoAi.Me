/**
 * electron-log: use in main for all console replacement.
 * Uncaught/unhandled handlers are registered in lifecycle.
 */
import log from "electron-log";

export function setupLogging(): void {
  log.initialize({ preload: false });
  // Optional: log.transports.file.level = 'info'; log.transports.console.level = 'debug';
}

export { log };
