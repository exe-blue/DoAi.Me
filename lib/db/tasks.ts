import { createServerClient } from "@/lib/supabase/server";
import type { Json, TaskRow, TaskLogRow } from "@/lib/supabase/types";

type TaskWithDetails = TaskRow & {
  videos: {
    title: string;
    thumbnail_url: string | null;
    duration_sec: number | null;
    id: string;
    target_views: number | null;
    completed_views: number | null;
    prob_like: number | null;
    prob_comment: number | null;
  } | null;
  channels: { name: string } | null;
};

export async function getTasksWithDetails() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("*, videos(title, thumbnail_url, duration_sec, id, target_views, completed_views, prob_like, prob_comment), channels(name)")
    .not("video_id", "is", null)
    .order("created_at", { ascending: false })
    .returns<TaskWithDetails[]>();
  if (error) throw error;
  return data;
}

export async function createTask(task: {
  video_id: string;
  channel_id: string;
  type: string;
  task_type?: string;
  device_count?: number;
  payload: Json;
  priority?: number;
  status?: string;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...task, status: task.status ?? "pending" } as any)
    .select()
    .returns<TaskRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, fields: {
  status?: string;
  priority?: number;
  result?: Json;
  error?: string;
  started_at?: string;
  completed_at?: string;
}) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(fields as any)
    .eq("id", id)
    .select()
    .returns<TaskRow[]>()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTask(id: string) {
  const supabase = createServerClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function getTaskLogs(taskId: string) {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("task_logs")
    .select("message, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
    .returns<Pick<TaskLogRow, "message" | "created_at">[]>();
  if (error) throw error;
  return (data ?? []).map((l) => `${l.created_at} - ${l.message ?? ""}`);
}

export async function getTaskByVideoId(videoId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("tasks")
    .select("id")
    .eq("video_id", videoId)
    .limit(1)
    .returns<Pick<TaskRow, "id">[]>()
    .maybeSingle();
  return data?.id ?? null;
}
