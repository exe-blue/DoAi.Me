import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Re-export types for consumers
export type { Database, Json } from "./database.types";

// ── Row type helpers ──────────────────────────────────────────────
type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];
type Enums = Database["public"]["Enums"];

// Table row types
export type WorkerRow = Tables["workers"]["Row"];
export type DeviceRow = Tables["devices"]["Row"];
export type AccountRow = Tables["accounts"]["Row"];
export type PresetRow = Tables["presets"]["Row"];
export type TaskRow = Tables["tasks"]["Row"];
export type TaskLogRow = Tables["task_logs"]["Row"];
export type TaskDeviceRow = Tables["task_devices"]["Row"];
export type ProxyRow = Tables["proxies"]["Row"];
export type ChannelRow = Tables["channels"]["Row"];
export type VideoRow = Tables["videos"]["Row"];
export type ScheduleRow = Tables["schedules"]["Row"];

// Insert types
export type TaskInsert = Tables["tasks"]["Insert"];
export type PresetInsert = Tables["presets"]["Insert"];

// View row types
export type DeviceDetailView = Views["v_device_detail"]["Row"];
export type WorkerSummaryView = Views["v_worker_summary"]["Row"];
export type TaskListView = Views["v_task_list"]["Row"];
export type DashboardStatsView = Views["v_dashboard_stats"]["Row"];

// Enum types
export type TaskStatus = Enums["task_status"];
export type TaskType = Enums["task_type"];
export type DeviceStatus = Enums["device_status"];
export type WorkerStatus = Enums["worker_status"];
export type AccountStatus = Enums["account_status"];
export type PresetType = Enums["preset_type"];
export type LogLevel = Enums["log_level"];

// ── Supabase server client ────────────────────────────────────────
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  });
}
