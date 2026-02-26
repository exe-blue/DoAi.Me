import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, VideoRow, TaskDeviceInsert } from "@/lib/supabase/types";
import type { TaskVariables } from "@/lib/types";
import { buildWatchWorkflowConfig } from "@/lib/workflow-templates";

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
  options: {
    deviceCount?: number;
    variables?: TaskVariables;
    workerId?: string;
    createdByUserId?: string;
    source?: "manual" | "channel_auto";
    priority?: number;
  } = {},
) {
  const supabase = createSupabaseServerClient();

  const payload: Json = {
    ...(options.variables ?? DEFAULT_VARIABLES),
  };

  const insertRow: Record<string, unknown> = {
    video_id: videoId,
    channel_id: channelId,
    type: "youtube",
    task_type: "view_farm",
    device_count: options.deviceCount ?? 20,
    payload,
    status: "pending",
    ...(options.workerId ? { worker_id: options.workerId } : {}),
    ...(options.createdByUserId ? { created_by: options.createdByUserId } : {}),
    ...(options.priority != null ? { priority: options.priority } : {}),
  };
  if (options.source) insertRow.source = options.source;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert([insertRow as any])
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
  const supabase = createSupabaseServerClient();
  const deviceCount = options.deviceCount ?? 20;
  const payload: Json = { ...(options.variables ?? DEFAULT_VARIABLES) };

  // Step 1: Fetch videos based on content mode (videos.id = YouTube video ID)
  let videos: Array<{ id: string; priority: string | null }> = [];
  let channelId = options.channelId;

  if (options.contentMode === "single") {
    if (!options.videoId) throw new Error("videoId required for single mode");
    const { data: video, error } = await supabase
      .from("videos")
      .select("id, priority, channel_id")
      .eq("id", options.videoId)
      .returns<
        Array<{ id: string; priority: string | null; channel_id: string }>
      >()
      .single();
    if (error) throw error;
    if (!video) throw new Error("Video not found");
    videos = [video];
    channelId = video.channel_id;
  } else if (options.contentMode === "channel") {
    if (!options.channelId)
      throw new Error("channelId required for channel mode");
    const { data, error } = await supabase
      .from("videos")
      .select("id, priority")
      .eq("channel_id", options.channelId)
      .eq("status", "active")
      .order("priority", { ascending: false })
      .returns<Array<{ id: string; priority: string | null }>>();
    if (error) throw error;
    if (!data || data.length === 0)
      throw new Error("No active videos found for channel");
    videos = data;
  } else if (options.contentMode === "playlist") {
    if (!options.videoIds || options.videoIds.length === 0) {
      throw new Error("videoIds required for playlist mode");
    }
    const { data, error } = await supabase
      .from("videos")
      .select("id, priority, channel_id")
      .in("id", options.videoIds)
      .returns<
        Array<{ id: string; priority: string | null; channel_id: string }>
      >();
    if (error) throw error;
    if (!data || data.length === 0)
      throw new Error("No videos found for playlist");
    videos = data;
    channelId = data[0].channel_id;
  }

  if (!channelId) throw new Error("channelId could not be determined");

  const taskRow: Record<string, unknown> = {
    video_id: videos[0].id,
    channel_id: channelId,
    type: "youtube",
    task_type: "view_farm",
    device_count: deviceCount,
    payload,
    status: "pending",
    ...(options.workerId ? { worker_id: options.workerId } : {}),
    ...(options.createdByUserId ? { created_by: options.createdByUserId } : {}),
    ...(options.priority != null ? { priority: options.priority } : {}),
  };
  if (options.source) taskRow.source = options.source;

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert(taskRow as any)
    .select()
    .single();

  if (taskError) throw taskError;

  // Step 3: Create task_devices per PC (가드레일: PC당 최대 deviceCount, 다른 PC에서 가져오지 않음)
  const distribution = options.distribution ?? "round_robin";
  const perPcCap = deviceCount;
  /** DB has config, pc_id, device_id (migrations); generated Insert type may be stale */
  type TaskDeviceInsertRow = TaskDeviceInsert & {
    config?: Json | null;
    pc_id?: string | null;
    device_id?: string | null;
  };

  const { data: pcs } = await supabase
    .from("pcs")
    .select("id")
    .returns<Array<{ id: string }>>();
  const pcList = pcs ?? [];

  const allTaskDevices: TaskDeviceInsertRow[] = [];
  const allConfigs: Array<{ video_url: string; video_id: string }> = [];

  if (pcList.length > 0) {
    for (const pc of pcList) {
      const devicesQuery = supabase
        .from("devices")
        .select("id, serial")
        .eq("pc_id", pc.id)
        .limit(Math.min(perPcCap, 100));
      const { data: devices } =
        await devicesQuery.returns<Array<{ id: string; serial: string }>>();
      const deviceList = devices ?? [];
      const cap = deviceList.length;
      if (cap === 0) continue;
      const deviceConfigsForPc = _distributeVideos(videos, cap, distribution);
      for (let i = 0; i < cap; i++) {
        const dev = deviceList[i];
        const serial = dev?.serial ?? `pc_${pc.id.slice(0, 8)}_${i + 1}`;
        const baseConfig = deviceConfigsForPc[i];
        const configWithWorkflow = buildWatchWorkflowConfig({
          title: "",
          keyword: baseConfig.video_id ?? "",
          expectedTitleContains: [],
          minWatchSec: 240,
          maxWatchSec: 420,
          minDurationSec: 30,
          maxDurationSec: 7200,
          probLike: 0.3,
          probComment: 0.05,
          probScrap: 0.1,
          videoId: baseConfig.video_id,
        });
        const configJson = {
          ...configWithWorkflow,
          video_url: baseConfig.video_url,
          video_id: baseConfig.video_id,
        } as unknown as Json;
        const row: TaskDeviceInsertRow = {
          task_id: task.id,
          device_serial: serial,
          status: "pending",
          config: configJson,
          worker_id: options.workerId ?? null,
          pc_id: pc.id,
        };
        if (dev?.id) row.device_id = dev.id;
        allTaskDevices.push(row);
        allConfigs.push(deviceConfigsForPc[i]);
      }
    }
  }

  // Fallback: PC가 없거나 모든 PC에 기기가 없으면 기존 방식(workerId 또는 플레이스홀더)
  if (allTaskDevices.length === 0) {
    const deviceConfigs = _distributeVideos(videos, deviceCount, distribution);
    let deviceSerials: string[] = [];
    if (options.workerId) {
      const { data: devices, error: devicesError } = await supabase
        .from("devices")
        .select("serial")
        .eq("worker_id", options.workerId)
        .limit(deviceCount)
        .returns<Array<{ serial: string }>>();
      if (!devicesError)
        deviceSerials = (devices ?? []).map((d: { serial: any }) => d.serial);
    }
    while (deviceSerials.length < deviceCount) {
      deviceSerials.push(`device_${deviceSerials.length + 1}`);
    }
    for (let i = 0; i < deviceCount; i++) {
      const baseConfig = deviceConfigs[i];
      const configWithWorkflow = buildWatchWorkflowConfig({
        title: "",
        keyword: baseConfig.video_id ?? "",
        expectedTitleContains: [],
        videoId: baseConfig.video_id,
      });
      const configJson = {
        ...configWithWorkflow,
        video_url: baseConfig.video_url,
        video_id: baseConfig.video_id,
      } as unknown as Json;
      allTaskDevices.push({
        task_id: task.id,
        device_serial: deviceSerials[i],
        status: "pending",
        config: configJson,
        worker_id: options.workerId ?? null,
      });
      allConfigs.push(deviceConfigs[i]);
    }
  }

  const { error: taskDevicesError } = await supabase
    .from("task_devices")
    .upsert(allTaskDevices as TaskDeviceInsert[], {
      onConflict: "task_id,device_id",
      ignoreDuplicates: true,
    });
  if (taskDevicesError) throw taskDevicesError;

  // Step 4: Increment completed_views for assigned videos
  const videoIdCounts = new Map<string, number>();
  for (const config of allConfigs) {
    const count = videoIdCounts.get(config.video_id) ?? 0;
    videoIdCounts.set(config.video_id, count + 1);
  }

  for (const [videoId, count] of videoIdCounts) {
    const { data: vid } = await supabase
      .from("videos")
      .select("completed_views")
      .eq("id", videoId)
      .returns<{ completed_views: number | null }[]>()
      .single();
    const current = vid?.completed_views ?? 0;
    await supabase
      .from("videos")
      .update({
        completed_views: current + count,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", videoId);
  }

  return task;
}

function _priorityWeight(p: string | null): number {
  switch (p) {
    case "urgent":
      return 4;
    case "high":
      return 3;
    case "normal":
      return 2;
    case "low":
      return 1;
    default:
      return 2;
  }
}

function _distributeVideos(
  videos: Array<{ id: string; priority: string | null }>,
  deviceCount: number,
  distribution: "round_robin" | "random" | "by_priority",
): Array<{ video_url: string; video_id: string }> {
  const configs: Array<{ video_url: string; video_id: string }> = [];
  const baseUrl = "https://www.youtube.com/watch?v=";

  if (distribution === "round_robin") {
    for (let i = 0; i < deviceCount; i++) {
      const video = videos[i % videos.length];
      configs.push({ video_url: baseUrl + video.id, video_id: video.id });
    }
  } else if (distribution === "random") {
    for (let i = 0; i < deviceCount; i++) {
      const video = videos[Math.floor(Math.random() * videos.length)];
      configs.push({ video_url: baseUrl + video.id, video_id: video.id });
    }
  } else if (distribution === "by_priority") {
    const totalPriority = videos.reduce(
      (sum, v) => sum + Math.max(_priorityWeight(v.priority), 1),
      0,
    );
    const weights = videos.map(
      (v) => Math.max(_priorityWeight(v.priority), 1) / totalPriority,
    );

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
      configs.push({
        video_url: baseUrl + selectedVideo.id,
        video_id: selectedVideo.id,
      });
    }
  }

  return configs;
}
