import { createServerClient } from "@/lib/supabase/server";
import type { Json, ScheduleRow } from "@/lib/supabase/types";
import type { TaskVariables } from "@/lib/types";

const DEFAULT_VARIABLES: TaskVariables = {
  watchPercent: 80,
  commentProb: 10,
  likeProb: 40,
  saveProb: 5,
  subscribeToggle: false,
};

export async function processNewVideos(videoIds: string[]) {
  const supabase = createServerClient();
  const createdTasks: string[] = [];
  const skippedVideos: string[] = [];

  for (const videoId of videoIds) {
    // Get the video with its channel_id
    const { data: video } = await supabase
      .from("videos")
      .select("id, channel_id, title")
      .eq("id", videoId)
      .single();

    if (!video || !video.channel_id) {
      skippedVideos.push(videoId);
      continue;
    }

    // Check for active schedules with trigger_type='new_video'
    const { data: schedules } = await supabase
      .from("schedules")
      .select("*")
      .eq("channel_id", video.channel_id)
      .eq("trigger_type", "new_video")
      .eq("is_active", true)
      .returns<ScheduleRow[]>();

    if (!schedules || schedules.length === 0) {
      skippedVideos.push(videoId);
      continue;
    }

    // Create task from the first matching schedule
    const schedule = schedules[0];
    const triggerConfig = (schedule.trigger_config && typeof schedule.trigger_config === "object" && !Array.isArray(schedule.trigger_config))
      ? schedule.trigger_config as Record<string, unknown>
      : {};

    const payload: Json = {
      ...DEFAULT_VARIABLES,
      ...triggerConfig,
    };

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        video_id: video.id,
        channel_id: video.channel_id,
        type: "youtube",
        task_type: schedule.task_type,
        device_count: schedule.device_count,
        payload,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.error(`Failed to create task for video ${videoId}:`, error);
      skippedVideos.push(videoId);
      continue;
    }

    // Update video status to processing
    await supabase
      .from("videos")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", videoId);

    // Update schedule last triggered
    await supabase
      .from("schedules")
      .update({
        last_triggered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", schedule.id);

    createdTasks.push(task.id);
  }

  return { createdTasks, skippedVideos };
}

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
