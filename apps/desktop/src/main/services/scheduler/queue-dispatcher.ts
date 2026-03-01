/**
 * Queue dispatcher: 30s poll, dequeue task_queue (queued) → create task, update queue.
 * Realtime hint can be wired later (channel + immediate tick).
 */
import log from "electron-log";
import { getSupabase } from "../supabase";
import { getConfig } from "../../app/lifecycle";

const DISPATCH_INTERVAL_MS = 30000;
let dispatchInterval: ReturnType<typeof setInterval> | null = null;
let lastQueueSize = -1;
let running = false;

async function tick(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || running) return;
  running = true;

  try {
    const config = getConfig();
    const maxConcurrent = config.maxConcurrentTasks ?? 10;

    const { count: runningCount, error: countErr } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "running");

    if (countErr) {
      log.error("[QueueDispatcher] Count error", countErr.message);
      return;
    }
    const available = Math.max(0, maxConcurrent - (runningCount ?? 0));

    const { count: queueSize } = await supabase
      .from("task_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");

    const currentQueueSize = queueSize ?? 0;
    if (lastQueueSize !== currentQueueSize) {
      if (currentQueueSize === 0) log.info("[QueueDispatcher] Queue empty");
      else log.info(`[QueueDispatcher] Queue has ${currentQueueSize} item(s)`);
      lastQueueSize = currentQueueSize;
    }

    if (available === 0 || currentQueueSize === 0) return;

    const { data: queueItems, error: dequeueErr } = await supabase
      .from("task_queue")
      .select("*")
      .eq("status", "queued")
      .is("target_worker", null)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(available);

    if (dequeueErr || !queueItems?.length) return;

    for (const item of queueItems) {
      try {
        const taskConfig = (item as { task_config?: Record<string, unknown> }).task_config ?? {};
        const insertData = {
          video_id: taskConfig.videoId ?? taskConfig.video_id ?? null,
          channel_id: taskConfig.channelId ?? taskConfig.channel_id ?? null,
          type: taskConfig.type ?? "youtube",
          task_type: taskConfig.taskType ?? taskConfig.task_type ?? "view_farm",
          device_count: taskConfig.deviceCount ?? taskConfig.device_count ?? 20,
          payload: taskConfig.variables ?? taskConfig.payload ?? {},
          status: "pending",
        };

        const { data: task, error: taskErr } = await supabase
          .from("tasks")
          .insert(insertData)
          .select("id")
          .single();

        if (taskErr) throw taskErr;

        await supabase
          .from("task_queue")
          .update({
            status: "dispatched",
            dispatched_task_id: task.id,
            dispatched_at: new Date().toISOString(),
          })
          .eq("id", item.id);

        log.info(`[QueueDispatcher] Dispatched queue=${item.id} → task=${task.id}`);
      } catch (err) {
        log.error(`[QueueDispatcher] Dispatch failed queue=${item.id}`, err);
      }
    }
  } finally {
    running = false;
  }
}

export function startQueueDispatcher(): void {
  if (dispatchInterval) return;
  dispatchInterval = setInterval(tick, DISPATCH_INTERVAL_MS);
  tick();
  log.info("[QueueDispatcher] Started (30s poll)");
}

export function stopQueueDispatcher(): void {
  if (dispatchInterval) {
    clearInterval(dispatchInterval);
    dispatchInterval = null;
  }
}
