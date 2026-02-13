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

export async function getVideosByChannelIdWithFilters(
  channelId: string,
  filters?: {
    sort_by?: "published_at" | "priority" | "play_count";
    is_active?: boolean;
  }
) {
  const supabase = createServerClient();
  let query = supabase
    .from("videos")
    .select("*")
    .eq("channel_id", channelId);

  if (filters?.is_active !== undefined) {
    query = query.eq("is_active", filters.is_active);
  }

  const sortBy = filters?.sort_by || "published_at";
  query = query.order(sortBy, { ascending: false });

  const { data, error } = await query.returns<VideoRow[]>();
  if (error) throw error;
  return data;
}

export async function createVideo(video: {
  channel_id: string;
  youtube_video_id: string;
  title: string;
  youtube_url?: string | null;
  priority?: number | null;
  is_active?: boolean;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .insert(video as any)
    .select()
    .returns<VideoRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkCreateVideos(
  videos: Array<{
    channel_id: string;
    youtube_video_id: string;
    title: string;
    youtube_url?: string | null;
    priority?: number | null;
    is_active?: boolean;
  }>
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .insert(videos as any)
    .select()
    .returns<VideoRow[]>();
  if (error) throw error;
  return data;
}

export async function updateVideo(
  id: string,
  updates: {
    title?: string;
    priority?: number | null;
    is_active?: boolean;
    duration_seconds?: number | null;
  }
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq("id", id)
    .select()
    .returns<VideoRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function bulkDeleteVideos(ids: string[]) {
  const supabase = createServerClient();
  const { error } = await supabase.from("videos").delete().in("id", ids);
  if (error) throw error;
}
