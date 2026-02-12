import { formatSubscriberCount } from "./youtube";
import type { Channel, Content, ContentStatus, Task, TaskVariables } from "./types";
import type { ChannelRow, VideoRow, TaskRow, Json } from "./supabase/types";

function formatDurationFromSeconds(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function extractHandleFromUrl(url: string): string | undefined {
  const match = url.match(/@[\w-]+/);
  return match ? match[0] : undefined;
}

function mapVideoStatusToContentStatus(dbStatus: string): ContentStatus {
  switch (dbStatus) {
    case "processing":
      return "task_created";
    case "completed":
      return "completed";
    default:
      return "pending";
  }
}

function extractVariables(payload: Json): TaskVariables {
  const defaults: TaskVariables = {
    watchPercent: 80,
    commentProb: 10,
    likeProb: 40,
    saveProb: 5,
    subscribeToggle: false,
  };
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return defaults;
  const p = payload as Record<string, unknown>;
  return {
    watchPercent: typeof p.watchPercent === "number" ? p.watchPercent : defaults.watchPercent,
    commentProb: typeof p.commentProb === "number" ? p.commentProb : defaults.commentProb,
    likeProb: typeof p.likeProb === "number" ? p.likeProb : defaults.likeProb,
    saveProb: typeof p.saveProb === "number" ? p.saveProb : defaults.saveProb,
    subscribeToggle: typeof p.subscribeToggle === "boolean" ? p.subscribeToggle : defaults.subscribeToggle,
  };
}

export function mapChannelRow(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.channel_name,
    youtubeId: row.youtube_channel_id,
    youtubeHandle: extractHandleFromUrl(row.channel_url),
    thumbnail: row.thumbnail_url || "/placeholder-channel.jpg",
    subscriberCount: formatSubscriberCount(row.subscriber_count),
    videoCount: row.video_count,
    addedAt: row.created_at,
    autoSync: row.monitoring_enabled,
  };
}

export function mapVideoRow(
  row: VideoRow & { channels?: { channel_name: string } | null },
  taskId: string | null = null
): Content {
  const channelName = row.channels?.channel_name ?? "";
  return {
    id: row.id,
    videoId: row.youtube_video_id,
    title: row.title,
    thumbnail: row.thumbnail_url || `https://img.youtube.com/vi/${row.youtube_video_id}/mqdefault.jpg`,
    duration: formatDurationFromSeconds(row.duration_seconds),
    channelName,
    publishedAt: row.published_at || row.created_at,
    registeredAt: row.created_at,
    taskId,
    status: mapVideoStatusToContentStatus(row.status),
  };
}

export function mapTaskRow(
  row: TaskRow & {
    videos?: { title: string; thumbnail_url: string | null; duration_seconds: number | null; youtube_video_id: string } | null;
    channels?: { channel_name: string } | null;
  },
  logs: string[] = []
): Task {
  const dbStatusToTaskStatus: Record<string, string> = {
    pending: "queued",
    started: "running",
    completed: "completed",
    failed: "error",
    stopped: "stopped",
  };
  return {
    id: row.id,
    title: row.videos?.title ?? "",
    channelName: row.channels?.channel_name ?? "",
    thumbnail: row.videos?.thumbnail_url || (row.videos?.youtube_video_id ? `https://img.youtube.com/vi/${row.videos.youtube_video_id}/mqdefault.jpg` : ""),
    duration: formatDurationFromSeconds(row.videos?.duration_seconds ?? null),
    videoId: row.videos?.youtube_video_id ?? "",
    status: (dbStatusToTaskStatus[row.status] ?? row.status) as Task["status"],
    priority: row.priority,
    isPriority: row.priority <= 3,
    assignedDevices: 0,
    totalDevices: row.device_count,
    progress: row.status === "completed" ? 100 : row.status === "started" ? 50 : 0,
    variables: extractVariables(row.payload),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    logs,
  };
}
