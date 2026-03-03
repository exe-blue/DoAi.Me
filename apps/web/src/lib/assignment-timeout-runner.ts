/**
 * Marks tasks that have been pending for 24h with no device progress as failed,
 * and sets the related video status to assignment_failed (removed from queue).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PENDING_AGE_HOURS = 24;

export type AssignmentTimeoutResult = {
  ok: true;
  processed: number;
  video_ids: string[];
};

export async function runAssignmentTimeout(): Promise<
  AssignmentTimeoutResult | { ok: false; error: string }
> {
  const supabase = createSupabaseServerClient();
  const cutoff = new Date(Date.now() - PENDING_AGE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: oldPendingTasks, error: fetchError } = await supabase
    .from("tasks")
    .select("id, video_id, created_at")
    .eq("status", "pending")
    .lt("created_at", cutoff);

  if (fetchError) {
    return { ok: false, error: fetchError.message ?? "Failed to fetch pending tasks" };
  }

  if (!oldPendingTasks?.length) {
    return { ok: true, processed: 0, video_ids: [] };
  }

  const videoIds: string[] = [];
  for (const task of oldPendingTasks) {
    const taskId = (task as { id: string }).id;
    const videoId = (task as { video_id?: string }).video_id;
    if (!videoId) continue;

    const { data: devices, error: devError } = await supabase
      .from("task_devices")
      .select("id, status")
      .eq("task_id", taskId);

    if (devError) continue;
    const hasProgress =
      Array.isArray(devices) &&
      devices.some((d: { status?: string }) =>
        ["running", "completed", "failed", "canceled", "cancelled"].includes(d.status ?? "")
      );
    if (hasProgress) continue;

    await supabase
      .from("videos")
      .update({ status: "assignment_failed", updated_at: new Date().toISOString() })
      .eq("id", videoId);
    await supabase.from("tasks").update({ status: "failed" }).eq("id", taskId);
    videoIds.push(videoId);

    try {
      await (supabase as any).from("task_queue").update({ status: "cancelled" }).eq("dispatched_task_id", taskId);
    } catch {
      /* ignore */
    }
  }

  return { ok: true, processed: videoIds.length, video_ids: videoIds };
}
