import { createServerClient } from "@/lib/supabase/server";
import type { ChannelRow } from "@/lib/supabase/types";

export async function getAllChannels() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .order("created_at", { ascending: true })
    .returns<ChannelRow[]>();
  if (error) throw error;
  return data;
}

export async function upsertChannel(channel: {
  youtube_channel_id: string;
  channel_name: string;
  channel_url: string;
  thumbnail_url?: string | null;
  subscriber_count?: number;
  video_count?: number;
  monitoring_enabled?: boolean;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("channels")
    .upsert(
      { ...channel, updated_at: new Date().toISOString() } as any,
      { onConflict: "youtube_channel_id" }
    )
    .select()
    .returns<ChannelRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChannel(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from("channels").delete().eq("id", id);
  if (error) throw error;
}

export async function updateChannelMonitoring(
  id: string,
  enabled: boolean,
  intervalMinutes?: number
) {
  const supabase = createServerClient();
  const update: Record<string, unknown> = {
    monitoring_enabled: enabled,
    updated_at: new Date().toISOString(),
  };
  if (intervalMinutes !== undefined) {
    update.monitoring_interval_minutes = intervalMinutes;
  }
  const { data, error } = await supabase
    .from("channels")
    .update(update as any)
    .eq("id", id)
    .select()
    .returns<ChannelRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function getChannelById(id: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("channels")
    .select("*")
    .eq("id", id)
    .returns<ChannelRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function createChannel(channel: {
  channel_name: string;
  youtube_channel_id?: string | null;
  channel_url?: string | null;
  category?: string | null;
  notes?: string | null;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("channels")
    .insert(channel as any)
    .select()
    .returns<ChannelRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChannel(
  id: string,
  updates: {
    channel_name?: string;
    youtube_channel_id?: string | null;
    channel_url?: string | null;
    category?: string | null;
    notes?: string | null;
    monitoring_enabled?: boolean;
    monitoring_interval_minutes?: number | null;
  }
) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("channels")
    .update({ ...updates, updated_at: new Date().toISOString() } as any)
    .eq("id", id)
    .select()
    .returns<ChannelRow[]>()
    .single();
  if (error) throw error;
  return data;
}
