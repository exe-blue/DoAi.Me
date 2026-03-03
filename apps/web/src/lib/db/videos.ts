import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { VideoRow } from "@/lib/supabase/types";

type VideoWithChannel = VideoRow & { channels: { name: string } | null };

export async function getVideosWithChannelName() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*, channels(name)")
    .order("created_at", { ascending: false })
    .returns<VideoWithChannel[]>();
  if (error) throw error;
  return data;
}

export async function getVideosByChannelId(channelId: string) {
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
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
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("videos").delete().in("id", ids);
  if (error) throw error;
}

/** 48h 기준: 작업가능 창(created_at >= now - 48h). */
const DEFAULT_QUEUE_SINCE_HOURS = 48;

/**
 * 남아있는 영상(대기열) 2건: 48시간 이내에서 "가장 최근 1건" + "조회수(completed_views) 최고 1건".
 * 스펙: docs/E2E_CHANNELS_CONTENT_SPEC.md §3.1
 */
export async function getQueueVideosTwoRows(
  options?: { sinceHours?: number }
): Promise<VideoRow[]> {
  const supabase = createSupabaseServerClient();
  const sinceHours = options?.sinceHours ?? DEFAULT_QUEUE_SINCE_HOURS;
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();

  const { data: latestList, error: e1 } = await supabase
    .from("videos")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<VideoRow[]>();

  if (e1) throw e1;
  const latest = latestList?.[0] ?? null;

  const secondQuery = supabase
    .from("videos")
    .select("*")
    .gte("created_at", since)
    .order("completed_views", { ascending: false })
    .limit(latest ? 2 : 1);

  const { data: byViews, error: e2 } = await secondQuery.returns<VideoRow[]>();
  if (e2) throw e2;

  const other = byViews?.find((v) => v.id !== latest?.id) ?? null;

  const out: VideoRow[] = [];
  if (latest) out.push(latest);
  if (other) out.push(other);
  return out;
}
