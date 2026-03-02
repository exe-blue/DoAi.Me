import { apiClient } from "@/lib/api";
import type { ChannelSummary, ContentSummary } from "./types";

interface ChannelsApiResponse {
  channels?: Array<Record<string, unknown>>;
  contents?: Array<Record<string, unknown>>;
}

function mapChannel(row: Record<string, unknown>): ChannelSummary {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    handle: row.handle != null ? String(row.handle) : null,
    profile_url: row.profile_url != null ? String(row.profile_url) : null,
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    subscriber_count: row.subscriber_count != null ? String(row.subscriber_count) : undefined,
    video_count: typeof row.video_count === "number" ? row.video_count : undefined,
    is_monitored: Boolean(row.is_monitored),
    last_collected_at: row.last_collected_at != null ? String(row.last_collected_at) : null,
    collection_status: row.collection_status != null ? String(row.collection_status) : undefined,
  };
}

function mapContent(row: Record<string, unknown>): ContentSummary {
  return {
    id: String(row.id ?? ""),
    title: row.title != null ? String(row.title) : undefined,
    channel_id: row.channel_id != null ? String(row.channel_id) : undefined,
    channel_name: row.channel_name != null ? String(row.channel_name) : undefined,
    thumbnail_url: row.thumbnail_url != null ? String(row.thumbnail_url) : null,
    duration_sec: typeof row.duration_sec === "number" ? row.duration_sec : undefined,
    status: row.status != null ? String(row.status) : undefined,
    watch_duration_sec: typeof row.watch_duration_sec === "number" ? row.watch_duration_sec : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

export async function getChannels(): Promise<ChannelSummary[]> {
  const res = await apiClient.get<ChannelsApiResponse>("/api/channels", { silent: true });
  if (!res.success || !res.data?.channels) return [];
  return (res.data.channels as Record<string, unknown>[]).map(mapChannel);
}

export async function getContents(): Promise<ContentSummary[]> {
  const res = await apiClient.get<ChannelsApiResponse>("/api/channels", { silent: true });
  if (!res.success) return [];
  const contents = res.data?.contents;
  if (Array.isArray(contents)) return contents.map((r) => mapContent(r as Record<string, unknown>));
  return [];
}
