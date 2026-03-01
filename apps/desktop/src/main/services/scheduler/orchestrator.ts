/**
 * Device orchestrator: 3s poll, claim task_device per device, run (stub), complete/fail.
 * Device list: from config.deviceSerials for now; Phase C will wire real Xiaowei list.
 */
import log from "electron-log";
import { getSupabase, getPcNumber, getPcUuid } from "../supabase";
import { claimTaskDevice, completeTaskDevice, failOrRetryTaskDevice } from "../supabase/rpc";
import { runTaskDevice } from "../task-executor";
import { getConfig } from "../../app/lifecycle";
import { takeScreenshotOnComplete } from "../screenshot";

const ORCHESTRATE_INTERVAL_MS = 3000;

let orchestrateInterval: ReturnType<typeof setInterval> | null = null;
const runningAssignments = new Set<string>();
const runningBySerial = new Set<string>();

function getDeviceSerials(): string[] {
  const config = getConfig();
  const serials = (config as { deviceSerials?: string[] }).deviceSerials;
  if (Array.isArray(serials) && serials.length > 0) return serials;
  return [];
}

async function orchestrate(): Promise<void> {
  const supabase = getSupabase();
  const pcNumber = getPcNumber();
  const pcUuid = getPcUuid();
  if (!supabase || !pcNumber || !pcUuid) return;

  const config = getConfig();
  const maxConcurrent = config.maxConcurrentTasks ?? 10;
  if (runningAssignments.size >= maxConcurrent) return;

  const serials = getDeviceSerials();
  for (const serial of serials) {
    if (runningAssignments.size >= maxConcurrent || runningBySerial.has(serial)) continue;
    const row = await claimTaskDevice(supabase, pcNumber, pcUuid, serial);
    if (!row) continue;

    const taskDeviceId = row.id;
    const deviceSerial = row.device_serial ?? serial;
    runningAssignments.add(taskDeviceId);
    runningBySerial.add(deviceSerial);
    try {
      await runTaskDevice(row);
      await completeTaskDevice(supabase, taskDeviceId);
      log.info("[Orchestrator] Completed task_device", taskDeviceId);
      await takeScreenshotOnComplete(deviceSerial).catch((e) =>
        log.warn("[Orchestrator] Screenshot failed", e)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failOrRetryTaskDevice(supabase, taskDeviceId, msg);
      log.warn("[Orchestrator] Failed task_device", taskDeviceId, msg);
    } finally {
      runningAssignments.delete(taskDeviceId);
      runningBySerial.delete(deviceSerial);
    }
  }
}

export function startOrchestrator(): void {
  if (orchestrateInterval) return;
  orchestrateInterval = setInterval(() => orchestrate().catch((e) => log.error("[Orchestrator]", e)), ORCHESTRATE_INTERVAL_MS);
  log.info("[Orchestrator] Started (3s poll)");
}

export function stopOrchestrator(): void {
  if (orchestrateInterval) {
    clearInterval(orchestrateInterval);
    orchestrateInterval = null;
  }
}
