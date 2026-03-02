import { formatSubscriberCount } from "./youtube";
import type {
  Channel,
  Content,
  ContentStatus,
  Task,
  TaskVariables,
} from "./types";
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
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return defaults;
  const p = payload as Record<string, unknown>;
  return {
    watchPercent:
      typeof p.watchPercent === "number"
        ? p.watchPercent
        : defaults.watchPercent,
    commentProb:
      typeof p.commentProb === "number" ? p.commentProb : defaults.commentProb,
    likeProb: typeof p.likeProb === "number" ? p.likeProb : defaults.likeProb,
    saveProb: typeof p.saveProb === "number" ? p.saveProb : defaults.saveProb,
    subscribeToggle:
      typeof p.subscribeToggle === "boolean"
        ? p.subscribeToggle
        : defaults.subscribeToggle,
  };
}

function calculateProgress(
  status: string,
  result: Record<string, unknown> | null,
): number {
  if (status === "completed" || status === "done") return 100;
  if (status === "failed") return 100;
  if (status === "pending" || status === "assigned") return 0;
  // running — check result for per-device progress
  if (result && typeof result.total === "number" && result.total > 0) {
    const done = (result.done as number) || 0;
    const failed = (result.failed as number) || 0;
    return Math.round(((done + failed) / result.total) * 100);
  }
  return 0;
}

export function mapChannelRow(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    youtubeId: row.id,
    youtubeHandle: row.handle ?? extractHandleFromUrl(row.profile_url ?? ""),
    thumbnail: row.thumbnail_url || "/placeholder-channel.jpg",
    subscriberCount: formatSubscriberCount(
      parseInt(row.subscriber_count ?? "0", 10) || 0,
    ),
    videoCount: row.video_count ?? 0,
    addedAt: row.created_at ?? "",
    autoSync: row.is_monitored ?? false,
  };
}

export function mapVideoRow(
  row: VideoRow & {
    channels?: { name: string } | null;
    source?: string | null;
  },
  taskId: string | null = null,
): Content {
  const channelName = row.channels?.name ?? row.channel_name ?? "";
  return {
    id: row.id,
    videoId: row.id,
    title: row.title ?? "",
    thumbnail:
      row.thumbnail_url || `https://img.youtube.com/vi/${row.id}/mqdefault.jpg`,
    duration: formatDurationFromSeconds(row.duration_sec),
    channelName,
    publishedAt: row.created_at ?? "",
    registeredAt: row.created_at ?? "",
    taskId,
    status: mapVideoStatusToContentStatus(row.status ?? ""),
    source:
      row.source === "manual" || row.source === "channel_auto"
        ? row.source
        : undefined,
  };
}

export function mapTaskRow(
  row: TaskRow & {
    videos?: {
      title: string;
      thumbnail_url: string | null;
      duration_sec: number | null;
      id: string;
      target_views?: number | null;
      completed_views?: number | null;
      prob_like?: number | null;
      prob_comment?: number | null;
    } | null;
    channels?: { name: string } | null;
  },
  logs: string[] = [],
): Task {
  const dbStatusToTaskStatus: Record<string, string> = {
    pending: "queued",
    running: "running",
    completed: "completed",
    failed: "error",
    cancelled: "stopped",
  };
  const result =
    row.result && typeof row.result === "object" && !Array.isArray(row.result)
      ? (row.result as Record<string, unknown>)
      : null;
  const targetViews = row.videos?.target_views ?? null;
  const completedViews = row.videos?.completed_views ?? null;
  const progressFromVideo =
    targetViews != null && targetViews > 0 && completedViews != null
      ? Math.min(100, Math.round((completedViews / targetViews) * 100))
      : null;
  const rawSource = (row as { source?: unknown }).source;
  const source =
    rawSource === null
      ? null
      : rawSource === "manual" || rawSource === "channel_auto"
        ? rawSource
        : undefined;
  return {
    id: row.id,
    title: row.videos?.title ?? "",
    channelName: row.channels?.name ?? "",
    thumbnail:
      row.videos?.thumbnail_url ||
      (row.videos?.id
        ? `https://img.youtube.com/vi/${row.videos.id}/mqdefault.jpg`
        : ""),
    duration: formatDurationFromSeconds(row.videos?.duration_sec ?? null),
    videoId: row.videos?.id ?? "",
    status: (dbStatusToTaskStatus[row.status ?? ""] ??
      row.status) as Task["status"],
    priority: row.priority ?? 5,
    isPriority: (row.priority ?? 5) <= 3,
    assignedDevices: 0,
    totalDevices: row.device_count ?? 0,
    progress:
      progressFromVideo ?? calculateProgress(row.status || "pending", result),
    variables: extractVariables(row.payload),
    createdAt: row.created_at ?? "",
    completedAt: row.completed_at ?? "",
    logs,
    targetViews: targetViews ?? undefined,
    completedViews: completedViews ?? undefined,
    probLike: row.videos?.prob_like ?? undefined,
    probComment: row.videos?.prob_comment ?? undefined,
    source,
    result,
  };
}
