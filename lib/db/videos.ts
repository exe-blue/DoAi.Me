import { createServerClient } from "@/lib/supabase/server";
import type { VideoRow } from "@/lib/supabase/types";

type VideoWithChannel = VideoRow & { channels: { channel_name: string } | null };

export async function getVideosWithChannelName() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*, channels(channel_name)")
    .order("published_at", { ascending: false })
    .returns<VideoWithChannel[]>();
  if (error) throw error;
  return data;
}

export async function getVideosByChannelId(channelId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*")
    .eq("channel_id", channelId)
    .order("published_at", { ascending: false })
    .returns<VideoRow[]>();
  if (error) throw error;
  return data;
}

export async function upsertVideo(video: {
  channel_id: string;
  youtube_video_id: string;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  published_at?: string | null;
  duration_seconds?: number | null;
  auto_detected?: boolean;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .upsert(
      { ...video, updated_at: new Date().toISOString() } as any,
      { onConflict: "youtube_video_id" }
    )
    .select()
    .returns<VideoRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVideoStatus(id: string, status: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("videos")
    .update({ status, updated_at: new Date().toISOString() } as any)
    .eq("id", id);
  if (error) throw error;
}
