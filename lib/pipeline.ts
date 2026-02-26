/**
 * Task_devices 생성기: 모든 발행 경로(dispatch-queue-runner, /api/tasks, /api/commands)는
 * 이 모듈을 통해 task + task_devices를 생성하고, config는 buildConfigFromWorkflow(snapshot.steps + scriptRef)로 통일.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Json, TaskDeviceInsert } from "@/lib/supabase/types";
import type { TaskVariables } from "@/lib/types";
import {
  buildConfigFromWorkflow,
  DEFAULT_WATCH_WORKFLOW_ID,
  DEFAULT_WATCH_WORKFLOW_VERSION,
} from "@/lib/workflow-snapshot";

const DEFAULT_VARIABLES: TaskVariables = {
  watchPercent: 80,
  commentProb: 10,
  likeProb: 40,
  saveProb: 5,
  subscribeToggle: false,
};

const YOUTUBE_WATCH_URL = "https://www.youtube.com/watch?v=";
const DEFAULT_PER_PC_CAP = 20;

/** Get PC list: pcs.id + max_devices, or fallback workers.id (pc_id for task_devices). Devices per PC = limit or pcs.max_devices. */
async function getPcList(
  supabase: ReturnType<typeof createSupabaseServerClient>,
): Promise<Array<{ id: string; max_devices?: number }>> {
  const { data: pcs } = await supabase
    .from("pcs")
    .select("id, max_devices")
    .returns<Array<{ id: string; max_devices?: number | null }>>();
  if (pcs && pcs.length > 0) {
    return pcs.map((p: { id: string; max_devices?: number | null }) => ({
      id: p.id,
      max_devices: p.max_devices ?? undefined,
    }));
  }
  const { data: workers } = await supabase
    .from("workers")
    .select("id")
    .returns<Array<{ id: string }>>();
  return (workers ?? []).map((w: { id: string }) => ({ id: w.id }));
}

/** Get devices for a PC: by pc_id then worker_id, limit 20 or pc.max_devices. */
async function getDevicesForPc(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  pcId: string,
  limit: number,
): Promise<Array<{ id: string; serial?: string }>> {
  const { data: byPc } = await supabase
    .from("devices")
    .select("id, serial")
    .eq("pc_id", pcId)
    .limit(limit)
    .returns<Array<{ id: string; serial?: string }>>();
  if (byPc && byPc.length > 0) return byPc;
  const { data: byWorker } = await supabase
    .from("devices")
    .select("id, serial")
    .eq("worker_id", pcId)
    .limit(limit)
    .returns<Array<{ id: string; serial?: string }>>();
  return byWorker ?? [];
}

/**
 * Fan-out task_devices: one row per device, config = buildTaskDeviceConfig result (snapshot).
 * tasks remain for observability; task_devices are the execution unit.
 */
async function fanOutTaskDevices(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  taskId: string,
  baseConfig: Record<string, unknown>,
  inputs: Record<string, unknown>,
  options: { deviceCount?: number; workerId?: string } = {},
): Promise<void> {
  const deviceCount = options.deviceCount ?? 20;
  const pcList = await getPcList(supabase);
  const allTaskDevices: Array<{
    task_id: string;
    pc_id: string;
    device_id: string;
    status: string;
    config: Json;
  }> = [];

  for (const pc of pcList) {
    if (options.workerId && pc.id !== options.workerId) continue;
    const perPcCap = Math.min(
      deviceCount,
      pc.max_devices ?? DEFAULT_PER_PC_CAP,
    );
    const devices = await getDevicesForPc(supabase, pc.id, perPcCap);
    for (const dev of devices) {
      const config = {
        ...(JSON.parse(JSON.stringify(baseConfig)) as Record<string, unknown>),
        inputs,
      };
      allTaskDevices.push({
        task_id: taskId,
        pc_id: pc.id,
        device_id: dev.id,
        status: "pending",
        config: config as Json,
      });
    }
  }

  if (allTaskDevices.length > 0) {
    const { error: tdErr } = await supabase
      .from("task_devices")
      .upsert(allTaskDevices as unknown as TaskDeviceInsert[], {
        onConflict: "task_id,device_id",
        ignoreDuplicates: true,
      });
    if (tdErr) throw tdErr;
  }
}

/**
 * Create one task + fan-out task_devices for given devices (e.g. command).
 * Config = buildConfigFromWorkflow (snapshot). Used by commands and any single-task publish path.
 */
export async function createTaskWithTaskDevices(
  options: {
    taskPayload: Record<string, unknown>;
    workflowId?: string;
    workflowVersion?: number;
    inputs?: Record<string, unknown>;
    deviceIds?: Array<{ id: string; pc_id: string }>;
  },
): Promise<{ id: string }> {
  const supabase = createSupabaseServerClient();
  const workflowId =
    options.workflowId ?? DEFAULT_WATCH_WORKFLOW_ID;
  const workflowVersion =
    options.workflowVersion ?? DEFAULT_WATCH_WORKFLOW_VERSION;
  const inputs = options.inputs ?? {};

  const baseConfig = await buildConfigFromWorkflow(
    workflowId,
    workflowVersion,
    inputs,
  );

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert(options.taskPayload)
    .select("id")
    .single();
  if (taskErr) throw taskErr;
  if (!task?.id) throw new Error("Task insert did not return id");

  if (options.deviceIds && options.deviceIds.length > 0) {
    const rows = options.deviceIds.map((d) => ({
      task_id: task.id,
      pc_id: d.pc_id,
      device_id: d.id,
      status: "pending" as const,
      config: {
        ...(JSON.parse(JSON.stringify(baseConfig)) as Record<string, unknown>),
        inputs,
      } as Json,
    }));
    const { error: tdErr } = await supabase
      .from("task_devices")
      .upsert(rows as unknown as TaskDeviceInsert[], {
        onConflict: "task_id,device_id",
        ignoreDuplicates: true,
      });
    if (tdErr) throw tdErr;
  } else {
    await fanOutTaskDevices(supabase, task.id, baseConfig, inputs, {
      deviceCount: 20,
    });
  }

  return { id: task.id };
}

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
    workflowId?: string;
    workflowVersion?: number;
    workflowInputs?: Record<string, unknown>;
  } = {},
) {
  const supabase = createSupabaseServerClient();
  const deviceCount = options.deviceCount ?? 20;
  const payload: Json = {
    ...(options.variables ?? DEFAULT_VARIABLES),
  };

  const insertRow: Record<string, unknown> = {
    video_id: videoId,
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
  if (options.source) insertRow.source = options.source;

  const { data: task, error } = await supabase
    .from("tasks")
    .insert([insertRow as any])
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("videos")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", videoId);

  const { data: videoRow } = await supabase
    .from("videos")
    .select("search_keyword, title")
    .eq("id", videoId)
    .maybeSingle()
    .returns<{
      search_keyword?: string | null;
      title?: string | null;
    } | null>();
  const keyword =
    (videoRow?.search_keyword ?? videoRow?.title ?? videoId) || videoId;
  const inputs = {
    ...(options.workflowInputs ?? {}),
    videoId,
    video_url: YOUTUBE_WATCH_URL + videoId,
    keyword: String(keyword),
  };

  const workflowId = options.workflowId ?? DEFAULT_WATCH_WORKFLOW_ID;
  const workflowVersion =
    options.workflowVersion ?? DEFAULT_WATCH_WORKFLOW_VERSION;
  const baseConfig = await buildConfigFromWorkflow(
    workflowId,
    workflowVersion,
    inputs,
  );

  await fanOutTaskDevices(supabase, task.id, baseConfig, inputs, {
    deviceCount,
    workerId: options.workerId,
  });

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
  /** When set, task_devices.config is built from this workflow (snapshot + scriptRef). */
  workflowId?: string;
  workflowVersion?: number;
  /** Base inputs merged with per-device videoId/video_url/keyword. */
  workflowInputs?: Record<string, unknown>;
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

  // Step 3: Build workflow snapshot, then fan-out task_devices (pcs + devices by pc_id; config = buildTaskDeviceConfig)
  const distribution = options.distribution ?? "round_robin";
  const workflowId = options.workflowId ?? DEFAULT_WATCH_WORKFLOW_ID;
  const workflowVersion =
    options.workflowVersion ?? DEFAULT_WATCH_WORKFLOW_VERSION;
  const baseInputs = options.workflowInputs ?? {};

  const pcList = await getPcList(supabase);
  const deviceList: Array<{ pc_id: string; device_id: string }> = [];
  for (const pc of pcList) {
    if (options.workerId && pc.id !== options.workerId) continue;
    const perPcCap = Math.min(
      deviceCount,
      pc.max_devices ?? DEFAULT_PER_PC_CAP,
    );
    const devs = await getDevicesForPc(supabase, pc.id, perPcCap);
    for (const d of devs) {
      deviceList.push({ pc_id: pc.id, device_id: d.id });
    }
  }

  const deviceConfigs =
    deviceList.length > 0
      ? _distributeVideos(videos, deviceList.length, distribution)
      : [];
  const baseConfig = await buildConfigFromWorkflow(
    workflowId,
    workflowVersion,
    baseInputs,
  );

  const allTaskDevices: Array<{
    task_id: string;
    pc_id: string;
    device_id: string;
    status: string;
    config: Json;
  }> = [];
  for (let i = 0; i < deviceList.length; i++) {
    const { pc_id, device_id } = deviceList[i];
    const base = deviceConfigs[i];
    const config = {
      ...(JSON.parse(JSON.stringify(baseConfig)) as Record<string, unknown>),
      inputs: {
        ...baseInputs,
        videoId: base.video_id,
        video_url: base.video_url,
        keyword: base.video_id,
      },
    } as unknown as Json;
    allTaskDevices.push({
      task_id: task.id,
      pc_id,
      device_id,
      status: "pending",
      config,
    });
  }

  if (allTaskDevices.length > 0) {
    const { error: taskDevicesError } = await supabase
      .from("task_devices")
      .upsert(allTaskDevices as unknown as TaskDeviceInsert[], {
        onConflict: "task_id,device_id",
        ignoreDuplicates: true,
      });
    if (taskDevicesError) throw taskDevicesError;
  }

  // Step 4: Increment completed_views for assigned videos
  const videoIdCounts = new Map<string, number>();
  for (const config of deviceConfigs) {
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
