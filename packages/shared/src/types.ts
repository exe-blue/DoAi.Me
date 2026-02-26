/**
 * @doai/shared — DTOs for web and agent (runtime-agnostic).
 * No Next/Supabase client here; use lib/supabase (web) or agent (agent).
 */

/** PC/worker row (pcs table) */
export interface PcDto {
  id: string;
  pc_number: string | null;
  hostname: string | null;
  status: string | null;
  last_heartbeat: string | null;
}

/** Device row (devices table) */
export interface DeviceDto {
  id?: string;
  serial_number?: string;
  pc_id?: string;
  status?: string;
  model?: string | null;
  battery_level?: number | null;
  last_seen_at?: string | null;
}

/** Task row (tasks table) — minimal fields */
export interface TaskDto {
  id: string;
  status: string;
  task_name?: string;
  pc_id?: string | null;
  payload?: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  error?: string | null;
}
