/**
 * Stale task cleaner: recover on startup, periodic timeout check.
 * Mirrors agent/task/stale-task-cleaner.js (30min stale, 5min check).
 */
import log from "electron-log";
import { getSupabase, getPcUuid } from "../supabase";

const STALE_THRESHOLD_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

let checkInterval: ReturnType<typeof setInterval> | null = null;

export async function recoverStaleTasks(): Promise<number> {
  const supabase = getSupabase();
  const pcUuid = getPcUuid();
  if (!supabase || !pcUuid) return 0;

  const { data: staleTasks, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("status", "running")
    .eq("pc_id", pcUuid);

  if (error || !staleTasks?.length) return 0;

  const now = Date.now();
  const staleIds: string[] = [];
  for (const task of staleTasks) {
    const startedAt = task.started_at ? new Date(task.started_at).getTime() : 0;
    if (!task.started_at || now - startedAt > STALE_THRESHOLD_MS) staleIds.push(task.id);
  }
  if (staleIds.length === 0) return 0;

  await supabase
    .from("tasks")
    .update({
      status: "failed",
      error: "Agent crash recovery — task was running when agent restarted",
      updated_at: new Date().toISOString(),
    })
    .in("id", staleIds);

  log.info(`[StaleCleaner] Recovered ${staleIds.length} stale task(s)`);
  return staleIds.length;
}

function periodicCheck(): void {
  const supabase = getSupabase();
  const pcUuid = getPcUuid();
  if (!supabase || !pcUuid) return;

  supabase
    .from("tasks")
    .select("id, started_at")
    .eq("status", "running")
    .eq("pc_id", pcUuid)
    .then(({ data: runningTasks, error }) => {
      if (error || !runningTasks?.length) return;
      const timeoutThreshold = STALE_THRESHOLD_MS * 2;
      const timeoutIds = runningTasks
        .filter((t) => t.started_at && Date.now() - new Date(t.started_at).getTime() > timeoutThreshold)
        .map((t) => t.id);
      if (timeoutIds.length === 0) return;
      supabase
        .from("tasks")
        .update({
          status: "timeout",
          error: `Task exceeded maximum runtime (${Math.round(timeoutThreshold / 60000)} minutes)`,
          updated_at: new Date().toISOString(),
        })
        .in("id", timeoutIds)
        .then(({ error: updateErr }) => {
          if (updateErr) log.error("[StaleCleaner] Timeout update failed", updateErr.message);
          else log.info(`[StaleCleaner] Timed out ${timeoutIds.length} task(s)`);
        });
    });
}

export function startStaleCleaner(): void {
  if (checkInterval) return;
  checkInterval = setInterval(periodicCheck, CHECK_INTERVAL_MS);
  if (checkInterval.unref) checkInterval.unref();
  log.info("[StaleCleaner] Periodic check started");
}

export function stopStaleCleaner(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
