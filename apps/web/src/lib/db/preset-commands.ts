/**
 * Preset commands (pending queue). Table: preset_commands.
 * Used by dashboard to insert; agent polls status=pending.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface PresetCommandRow {
  id: string;
  pc_id: string | null;
  preset: string;
  serial: string | null;
  status: string;
  created_at: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  result?: unknown;
}

/** Use untyped client for preset_commands (table may not be in generated Database types yet). */
function fromPresetCommands(supabase: SupabaseClient) {
  return (supabase as { from: (t: string) => ReturnType<SupabaseClient["from"]> }).from("preset_commands");
}

export async function getPendingPresetCommands(
  supabase: SupabaseClient
): Promise<PresetCommandRow[]> {
  const { data, error } = await fromPresetCommands(supabase)
    .select("id, pc_id, preset, serial, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as PresetCommandRow[];
}

export async function insertPresetCommand(
  supabase: SupabaseClient,
  row: { pc_id: string; preset: string; serial?: string | null }
) {
  const { data, error } = await fromPresetCommands(supabase)
    .insert({
      pc_id: row.pc_id,
      preset: row.preset,
      serial: row.serial ?? null,
      status: "pending",
    })
    .select("id, pc_id, preset, serial, status, created_at")
    .single();
  if (error) throw error;
  return data as PresetCommandRow;
}
