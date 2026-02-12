import { createServerClient } from "@/lib/supabase/server";
import type { Json, ScheduleRow } from "@/lib/supabase/types";

export async function getActiveSchedulesForChannel(channelId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("channel_id", channelId)
    .eq("is_active", true)
    .returns<ScheduleRow[]>();
  if (error) throw error;
  return data;
}

export async function getSchedulesByTriggerType(triggerType: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedules")
    .select("*")
    .eq("trigger_type", triggerType)
    .eq("is_active", true)
    .returns<ScheduleRow[]>();
  if (error) throw error;
  return data;
}

export async function createSchedule(schedule: {
  channel_id: string;
  name: string;
  task_type: string;
  trigger_type: string;
  trigger_config?: Json;
  device_count?: number;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedules")
    .insert(schedule as any)
    .select()
    .returns<ScheduleRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSchedule(id: string, fields: {
  is_active?: boolean;
  device_count?: number;
  trigger_config?: Json;
  name?: string;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("schedules")
    .update({ ...fields, updated_at: new Date().toISOString() } as any)
    .eq("id", id)
    .select()
    .returns<ScheduleRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSchedule(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from("schedules").delete().eq("id", id);
  if (error) throw error;
}

export async function updateScheduleLastTriggered(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase
    .from("schedules")
    .update({
      last_triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", id);
  if (error) throw error;
}
