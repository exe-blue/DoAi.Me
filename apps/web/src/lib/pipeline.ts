import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json, VideoRow } from "@/lib/supabase/types";
import type { TaskVariables } from "@/lib/types";

/** Layer 4: call Edge Function to generate N comments from title + body. Returns null on failure/skip. */
async function generateCommentsForTask(
  title: string,
  body: string,
  count: number
): Promise<string[] | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || count < 1) return null;
  try {
    const res = await fetch(`${url}/functions/v1/generate-comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ title: title || "", body: body || "", count }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { comments?: string[] };
    return Array.isArray(data?.comments) ? data.comments : null;
  } catch {
    return null;
  }
}

const DEFAULT_VARIABLES: TaskVariables = {
  watchPercent: 80,
  commentProb: 10,
  likeProb: 40,
  saveProb: 5,
  subscribeToggle: false,
  watchMinPct: 20,
  watchMaxPct: 95,
  waitMinSec: 1,
  waitMaxSec: 5,
};

export async function createManualTask(
  videoId: string,
  channelId: string,
  options: {
    deviceCount?: number;
    variables?: TaskVariables;
    workerId?: string;
    createdByUserId?: string;
    commentCount?: number;
  } = {}
) {
  const supabase = createServiceRoleClient();
  const deviceCount = options.deviceCount ?? 20;

  const payload: Json = {
    ...(options.variables ?? DEFAULT_VARIABLES),
  };

  // Layer 4: optional AI comment generation (title + body → payload.comments); task_devices from trigger only
  const commentCount = options.commentCount ?? deviceCount;
  if (commentCount > 0) {
    const { data: video } = await supabase
      .from("videos")
      .select("title, description")
      .eq("id", videoId)
      .single();
    const title = (video as { title?: string; description?: string } | null)?.title ?? "";
    const body = (video as { title?: string; description?: string } | null)?.description ?? "";
    const comments = await generateCommentsForTask(title, body, commentCount);
    if (comments?.length) (payload as Record<string, unknown>).comments = comments;
  }

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      video_id: videoId,
      channel_id: channelId,
      type: "youtube",
      task_type: "view_farm",
      device_count: deviceCount,
      payload,
      status: "pending",
      ...(options.workerId ? { worker_id: options.workerId } : {}),
      ...(options.createdByUserId ? { created_by: options.createdByUserId } : {}),
    })
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("videos")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", videoId);

  return task;
}

type BatchTaskOptions = {
  contentMode: "single" | "channel" | "playlist";
  videoId?: string;
  channelId?: string;
  videoIds?: string[];
  distribution?: "round_robin" | "random" | "by_priority";
  deviceCount?: number;
  variables?: TaskVariables;
  workerId?: string;
  createdByUserId?: string;
  source?: "manual" | "channel_auto";
  priority?: number;
};

export async function createBatchTask(options: BatchTaskOptions) {
  const supabase = createServiceRoleClient();
  const deviceCount = options.deviceCount ?? 20;
  const payload: Json = { ...(options.variables ?? DEFAULT_VARIABLES) };

  // Step 1: Fetch videos based on content mode (videos.id = YouTube video ID)
  const videoSelect =
    "id, priority, channel_id, title, description, duration_sec, watch_duration_min_pct, watch_duration_max_pct, prob_like, prob_comment";
  type VideoRow = {
    id: string;
    priority: string | null;
    channel_id?: string;
    title?: string | null;
    description?: string | null;
    duration_sec?: number | null;
    watch_duration_min_pct?: number | null;
    watch_duration_max_pct?: number | null;
    prob_like?: number | null;
    prob_comment?: number | null;
  };
  let videos: VideoRow[] = [];
  let channelId = options.channelId;

  if (options.contentMode === "single") {
    if (!options.videoId) throw new Error("videoId required for single mode");
    const { data: video, error } = await supabase
      .from("videos")
      .select(videoSelect)
      .eq("id", options.videoId)
      .returns<VideoRow[]>()
      .single();
    if (error) throw error;
    if (!video) throw new Error("Video not found");
    videos = [video];
    channelId = video.channel_id ?? channelId;
  } else if (options.contentMode === "channel") {
    if (!options.channelId) throw new Error("channelId required for channel mode");
    const { data, error } = await supabase
      .from("videos")
      .select("id, priority, title, description, duration_sec, watch_duration_min_pct, watch_duration_max_pct, prob_like, prob_comment")
      .eq("channel_id", options.channelId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .returns<VideoRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("No active videos found for channel");
    videos = data;
  } else if (options.contentMode === "playlist") {
    if (!options.videoIds || options.videoIds.length === 0) {
      throw new Error("videoIds required for playlist mode");
    }
    const { data, error } = await supabase
      .from("videos")
      .select(videoSelect)
      .in("id", options.videoIds)
      .returns<VideoRow[]>();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("No videos found for playlist");
    videos = data;
    channelId = data[0].channel_id ?? channelId;
  }

  if (!channelId) throw new Error("channelId could not be determined");

  // Layer 4: optional AI comment generation (title + body → payload.comments); task_devices from trigger only
  const commentCount = options.deviceCount ?? 20;
  if (commentCount > 0 && videos[0]) {
    const title = videos[0].title ?? "";
    const body = (videos[0] as { description?: string | null }).description ?? "";
    const comments = await generateCommentsForTask(title, body, commentCount);
    if (comments?.length) (payload as Record<string, unknown>).comments = comments;
  }

  // Step 2: Create the task (task_devices created by DB trigger)
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      video_id: videos[0].id, // Use first video as primary
      channel_id: channelId,
      type: "youtube",
      task_type: "view_farm",
      device_count: deviceCount,
      payload,
      status: "pending",
      ...(options.workerId ? { worker_id: options.workerId } : {}),
      ...(options.createdByUserId ? { created_by: options.createdByUserId } : {}),
    })
    .select()
    .single();

  if (taskError) throw taskError;

  // Step 3: task_devices are created server-side by DB trigger (fn_create_task_devices_on_task_insert)
  // after this task insert. No app-side task_devices insert here.

  return task;
}

function _priorityWeight(p: string | null): number {
  switch (p) {
    case "urgent": return 4;
    case "high": return 3;
    case "normal": return 2;
    case "low": return 1;
    default: return 2;
  }
}

/** Layer 3: build task_devices.config from video + variables. */
function _buildDeviceConfig(opts: {
  videoId: string;
  title?: string | null;
  durationSec?: number | null;
  watchMinPct?: number | null;
  watchMaxPct?: number | null;
  probLike?: number | null;
  probComment?: number | null;
  variables?: TaskVariables;
}): Record<string, unknown> {
  const vars = opts.variables ?? DEFAULT_VARIABLES;
  const baseUrl = "https://www.youtube.com/watch?v=";
  return {
    video_url: baseUrl + opts.videoId,
    video_id: opts.videoId,
    title: opts.title ?? undefined,
    keyword: opts.title ?? undefined,
    duration_sec: opts.durationSec ?? undefined,
    min_wait_sec: vars.waitMinSec ?? 1,
    max_wait_sec: vars.waitMaxSec ?? 5,
    watch_min_pct: opts.watchMinPct ?? vars.watchMinPct ?? vars.watchPercent ?? 20,
    watch_max_pct: opts.watchMaxPct ?? vars.watchMaxPct ?? vars.watchPercent ?? 95,
    prob_like: opts.probLike ?? vars.likeProb ?? 40,
    prob_comment: opts.probComment ?? vars.commentProb ?? 10,
    prob_playlist: vars.saveProb ?? 5,
  };
}

type VideoForDistribute = {
  id: string;
  priority: string | null;
  title?: string | null;
  duration_sec?: number | null;
  watch_duration_min_pct?: number | null;
  watch_duration_max_pct?: number | null;
  prob_like?: number | null;
  prob_comment?: number | null;
};

function _distributeVideos(
  videos: VideoForDistribute[],
  deviceCount: number,
  distribution: "round_robin" | "random" | "by_priority",
  variables?: TaskVariables,
): Array<Record<string, unknown>> {
  const configs: Array<Record<string, unknown>> = [];
  const vars = variables ?? DEFAULT_VARIABLES;

  const pickVideo = (video: VideoForDistribute) =>
    _buildDeviceConfig({
      videoId: video.id,
      title: video.title,
      durationSec: video.duration_sec,
      watchMinPct: video.watch_duration_min_pct,
      watchMaxPct: video.watch_duration_max_pct,
      probLike: video.prob_like,
      probComment: video.prob_comment,
      variables: vars,
    });

  if (distribution === "round_robin") {
    for (let i = 0; i < deviceCount; i++) {
      const video = videos[i % videos.length];
      configs.push(pickVideo(video));
    }
  } else if (distribution === "random") {
    for (let i = 0; i < deviceCount; i++) {
      const video = videos[Math.floor(Math.random() * videos.length)];
      configs.push(pickVideo(video));
    }
  } else if (distribution === "by_priority") {
    const totalPriority = videos.reduce((sum, v) => sum + Math.max(_priorityWeight(v.priority), 1), 0);
    const weights = videos.map((v) => Math.max(_priorityWeight(v.priority), 1) / totalPriority);

    for (let i = 0; i < deviceCount; i++) {
      const rand = Math.random();
      let cumulative = 0;
      let selectedVideo = videos[0];
      for (let j = 0; j < videos.length; j++) {
        cumulative += weights[j];
        if (rand <= cumulative) {
          selectedVideo = videos[j];
          break;
        }
      }
      configs.push(pickVideo(selectedVideo));
    }
  }

  return configs;
}

type TaskWithDevicesOptions = {
  taskPayload: {
    type: string;
    task_type?: string | null;
    video_id?: string | null;
    channel_id?: string | null;
    payload?: Json;
    status?: string;
    title?: string | null;
  };
  workflowId?: string | null;
  workflowVersion?: string | null;
  inputs?: Record<string, unknown> | null;
  deviceIds?: Array<{ id: string; serial: string; pc_id: string }>;
};

export async function createTaskWithTaskDevices(options: TaskWithDevicesOptions) {
  const supabase = createServiceRoleClient();

  const payloadJson = {
    ...(typeof options.taskPayload.payload === "object" && options.taskPayload.payload !== null
      ? (options.taskPayload.payload as Record<string, unknown>)
      : {}),
    ...(options.workflowId ? { workflow_id: options.workflowId } : {}),
    ...(options.workflowVersion ? { workflow_version: options.workflowVersion } : {}),
    ...(options.inputs ? { workflow_inputs: options.inputs } : {}),
  } as Json;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      type: options.taskPayload.type as "youtube" | "preset" | "adb" | "direct" | "batch",
      task_type: options.taskPayload.task_type ?? null,
      video_id: options.taskPayload.video_id ?? null,
      channel_id: options.taskPayload.channel_id ?? null,
      payload: payloadJson,
      status: (options.taskPayload.status ?? "pending") as "pending",
      title: options.taskPayload.title ?? null,
      device_count: options.deviceIds?.length ?? null,
    })
    .select()
    .single();

  if (error) throw error;

  // task_devices are created server-side by DB trigger.

  return task;
}
