/**
 * Scheduler: orchestrator (3s), queue-dispatcher (30s), stale-cleaner (5min).
 */
import log from "electron-log";
import { recoverStaleTasks, startStaleCleaner, stopStaleCleaner } from "./stale-cleaner";
import { startQueueDispatcher, stopQueueDispatcher } from "./queue-dispatcher";
import { startOrchestrator, stopOrchestrator } from "./orchestrator";

export function startSchedulers(): void {
  recoverStaleTasks()
    .then((n) => n > 0 && log.info(`[Scheduler] Recovered ${n} stale tasks`))
    .catch((e) => log.warn("[Scheduler] Stale recover failed", e));
  startStaleCleaner();
  startQueueDispatcher();
  startOrchestrator();
}

export function stopSchedulers(): void {
  stopOrchestrator();
  stopQueueDispatcher();
  stopStaleCleaner();
}
