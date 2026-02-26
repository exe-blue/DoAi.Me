import { createServerClient } from "@/lib/supabase/server";
import type { VideoRow } from "@/lib/supabase/types";

type VideoWithChannel = VideoRow & { channels: { name: string } | null };

export async function getVideosWithChannelName() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*, channels(name)")
    .order("created_at", { ascending: false })
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
    .order("created_at", { ascending: false })
    .returns<VideoRow[]>();
  if (error) throw error;
  return data;
}

export async function upsertVideo(video: {
  channel_id: string;
  id: string;
  title: string;
  channel_name?: string | null;
  thumbnail_url?: string | null;
  duration_sec?: number | null;
  source?: "manual" | "channel_auto" | null;
}) {
  const supabase = createServerClient();
  const row = { ...video, updated_at: new Date().toISOString() } as any;
  const { data, error } = await supabase
    .from("videos")
    .upsert(row, { onConflict: "id" })
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
    sort_by?: "created_at" | "priority" | "priority_updated_at";
    status?: string;
  }
) {
  const supabase = createServerClient();
  let query = supabase
    .from("videos")
    .select("*")
    .eq("channel_id", channelId);

  if (filters?.status !== undefined) {
    query = query.eq("status", filters.status);
  }

  const sortBy = filters?.sort_by || "created_at";
  query = query.order(sortBy, { ascending: false });

  const { data, error } = await query.returns<VideoRow[]>();
  if (error) throw error;
  return data;
}

export async function createVideo(video: {
  channel_id: string;
  id: string;
  title: string;
  channel_name?: string | null;
  thumbnail_url?: string | null;
  duration_sec?: number | null;
  priority?: string | null;
  status?: string | null;
  source?: "manual" | "channel_auto" | null;
  target_views?: number | null;
  prob_like?: number | null;
  prob_comment?: number | null;
  watch_duration_sec?: number | null;
  watch_duration_min_pct?: number | null;
  watch_duration_max_pct?: number | null;
  prob_subscribe?: number | null;
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
    id: string;
    title: string;
    channel_name?: string | null;
    priority?: string | null;
    status?: string | null;
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
    priority?: string | null;
    status?: string | null;
    duration_sec?: number | null;
    target_views?: number | null;
    prob_like?: number | null;
    prob_comment?: number | null;
    watch_duration_sec?: number | null;
    watch_duration_min_pct?: number | null;
    watch_duration_max_pct?: number | null;
    prob_subscribe?: number | null;
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
