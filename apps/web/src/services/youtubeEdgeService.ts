import { createClient } from "@/lib/supabase/browser";

export async function dispatchQueueViaEdge() {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("dispatch-queue");
  if (error) throw error;
  return data;
}

export async function syncChannelsViaEdge() {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("sync-channels");
  if (error) throw error;
  return data;
}

export async function createYoutubeCommandTask(payload: Record<string, unknown>) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("youtube-command", { body: payload });
  if (error) throw error;
  return data;
}

export async function createYoutubeDeployTask(payload: Record<string, unknown>) {
  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke("youtube-deploy", { body: payload });
  if (error) throw error;
  return data;
}
