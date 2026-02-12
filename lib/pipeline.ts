import { createServerClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { TaskVariables } from "@/lib/types";

const DEFAULT_VARIABLES: TaskVariables = {
  watchPercent: 80,
  commentProb: 10,
  likeProb: 40,
  saveProb: 5,
  subscribeToggle: false,
};

export async function createManualTask(
  videoId: string,
  channelId: string,
  options: { deviceCount?: number; variables?: TaskVariables; workerId?: string } = {}
) {
  const supabase = createServerClient();

  const payload: Json = {
    ...(options.variables ?? DEFAULT_VARIABLES),
  };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      video_id: videoId,
      channel_id: channelId,
      type: "youtube",
      task_type: "view_farm",
      device_count: options.deviceCount ?? 20,
      payload,
      status: "pending",
      ...(options.workerId ? { worker_id: options.workerId } : {}),
    })
    .select()
    .single();

  if (error) throw error;

  // Update video status
  await supabase
    .from("videos")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", videoId);

  return task;
}
