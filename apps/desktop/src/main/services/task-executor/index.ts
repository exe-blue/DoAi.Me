/**
 * Task executor: runTaskDevice with watch duration clamp (15s–20min).
 * Phase C: Full YouTube flow (Xiaowei commands) can be ported or invoked from agent; here we stub execute.
 */
import log from "electron-log";
import type { TaskDeviceRow } from "../supabase/rpc";

const ABSOLUTE_MIN_SEC = 15;
const ABSOLUTE_MAX_SEC = 20 * 60;

function resolveWatchDurationSec(cfg: Record<string, unknown>): number {
  const durationSec = Number(cfg.duration_sec);
  const minPct = Number(cfg.watch_min_pct);
  const maxPct = Number(cfg.watch_max_pct);
  if (Number.isFinite(durationSec) && durationSec > 0 && Number.isFinite(minPct) && Number.isFinite(maxPct)) {
    const pct = minPct + Math.random() * (maxPct - minPct);
    const calculated = Math.round((durationSec * pct) / 100);
    return Math.min(ABSOLUTE_MAX_SEC, Math.max(ABSOLUTE_MIN_SEC, calculated));
  }
  return Math.min(ABSOLUTE_MAX_SEC, Math.max(ABSOLUTE_MIN_SEC, 60));
}

/**
 * Run one task_device. Comment: use ready if present, else fallback (stub). Watch: clamp then stub delay.
 */
export async function runTaskDevice(row: TaskDeviceRow): Promise<void> {
  const serial = row.device_serial ?? "unknown";
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  const watchSec = resolveWatchDurationSec(cfg);
  const commentStatus = (row as { comment_status?: string }).comment_status;
  const commentContent = (row as { comment_content?: string }).comment_content;

  if (commentStatus === "ready" && commentContent) {
    log.info("[TaskExecutor] Using pre-generated comment");
  } else {
    log.info("[TaskExecutor] Comment fallback (stub)");
  }

  log.info(`[TaskExecutor] runTaskDevice serial=${serial} watchSec=${watchSec} (clamped 15s–20m)`);
  await new Promise((r) => setTimeout(r, Math.min(watchSec * 1000, 5000)));
}
