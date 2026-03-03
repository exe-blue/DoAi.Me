"use server";

import { revalidatePath } from "next/cache";
import { fetchVideoById } from "@/lib/youtube";
import { upsertVideo } from "@/lib/db/videos";

function parseDurationToSec(duration: string): number {
  const parts = duration.split(":").map(Number);
  if (parts.length === 3)
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function extractVideoId(urlOrId: string): string {
  const trimmed = urlOrId.trim();
  const match = trimmed.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:&|\?|$)/);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  throw new Error("Invalid video URL or ID");
}

export async function registerContent(urlOrVideoId: string) {
  const trimmed = urlOrVideoId.trim();
  if (!trimmed) return { ok: false, error: "Video URL or ID required" };
  try {
    const videoId = extractVideoId(trimmed);
    const info = await fetchVideoById(videoId);
    const durationSec = parseDurationToSec(info.duration);
    await upsertVideo({
      channel_id: info.channelId,
      id: info.videoId,
      title: info.title,
      channel_name: info.channelTitle,
      thumbnail_url: info.thumbnail,
      duration_sec: durationSec,
      source: "manual",
    });
    revalidatePath("/youtube/contents");
    return { ok: true, id: info.videoId, title: info.title };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to register content",
    };
  }
}
