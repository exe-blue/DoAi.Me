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
  id: string;
  name: string;
  profile_url: string;
  thumbnail_url?: string | null;
  subscriber_count?: string | null;
  video_count?: number;
  is_monitored?: boolean;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("channels")
    .upsert(
      { ...channel, updated_at: new Date().toISOString() } as any,
      { onConflict: "id" }
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
  intervalHours?: number
) {
  const supabase = createServerClient();
  const update: Record<string, unknown> = {
    is_monitored: enabled,
    updated_at: new Date().toISOString(),
  };
  if (intervalHours !== undefined) {
    update.collect_interval_hours = intervalHours;
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
  id: string;
  name: string;
  profile_url?: string | null;
  category?: string | null;
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
    name?: string;
    profile_url?: string | null;
    category?: string | null;
    is_monitored?: boolean;
    collect_interval_hours?: number | null;
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
