"use server";

import { revalidatePath } from "next/cache";
import { resolveChannelHandle } from "@/lib/youtube";
import { upsertChannel } from "@/lib/db/channels";

export async function registerChannel(handleOrUrl: string) {
  const trimmed = handleOrUrl.trim();
  if (!trimmed) return { ok: false, error: "Handle or URL required" };
  try {
    const info = await resolveChannelHandle(trimmed);
    await upsertChannel({
      id: info.id,
      name: info.title,
      profile_url: info.thumbnail,
      thumbnail_url: info.thumbnail,
      handle: info.handle,
      subscriber_count: String(info.subscriberCount),
      video_count: info.videoCount,
      is_monitored: true,
    } as any);
    revalidatePath("/youtube/channels");
    return { ok: true, id: info.id, name: info.title };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to register channel",
    };
  }
}
