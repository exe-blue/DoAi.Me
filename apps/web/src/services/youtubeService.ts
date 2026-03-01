/**
 * YouTube channels & contents. Uses existing GET/POST /api/channels (returns channels + contents).
 * No new endpoints; assumption types only.
 */
import { apiClient } from "@/lib/api";
import type { YoutubeChannel, YoutubeContent } from "./types";

const CHANNELS_URL = "/api/channels";

/** Channels + contents from existing GET /api/channels. */
export async function getChannelsAndContents(): Promise<{
  channels: YoutubeChannel[];
  contents: YoutubeContent[];
}> {
  const res = await apiClient.get<{ channels?: unknown[]; contents?: unknown[] }>(CHANNELS_URL);
  if (res.success && res.data) {
    const ch = (res.data as any).channels ?? [];
    const co = (res.data as any).contents ?? [];
    const channels: YoutubeChannel[] = (ch as any[]).map((c) => ({
      id: c.id,
      name: c.name ?? "",
      handle: c.handle ?? null,
      lastCollectedAt: c.last_collected_at ?? null,
      status: c.status ?? null,
      isMonitored: c.is_monitored ?? false,
      videoCount: c.video_count ?? 0,
    }));
    const contents: YoutubeContent[] = (co as any[]).map((v) => ({
      id: v.id,
      title: v.title ?? "",
      channelId: v.channel_id ?? "",
      channelName: v.channel_name ?? undefined,
      status: v.status ?? undefined,
      thumbnailUrl: v.thumbnail_url ?? null,
    }));
    return { channels, contents };
  }
  return { channels: [], contents: [] };
}

/**
 * Register new channel. Uses existing POST /api/channels when body matches.
 * TODO: exact body shape (name, youtube_channel_id or youtube_url) from API contract.
 */
export async function registerChannel(payload: {
  name: string;
  youtube_channel_id?: string;
  youtube_url?: string;
  category?: string;
}): Promise<{ success: boolean; error?: string }> {
  const r = await apiClient.post(CHANNELS_URL, { body: payload });
  if (r.success) return { success: true };
  return { success: false, error: r.error ?? "Failed to register channel" };
}

/**
 * Delete or deactivate channel. TODO: assume API DELETE /api/channels/[id] exists when implemented.
 * For now, no such endpoint — return stub.
 */
export async function deleteChannel(_id: string): Promise<{ success: boolean; error?: string }> {
  // TODO: call DELETE /api/channels/[id] when endpoint exists
  return { success: false, error: "Not implemented: DELETE channel API" };
}

/**
 * Create content (e.g. video task). TODO: assume API exists for content creation.
 * No creation endpoint in scope — stub.
 */
export async function createContent(_payload: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  // TODO: wire to actual content/video creation API when available
  return { success: false, error: "Not implemented: content creation API" };
}
