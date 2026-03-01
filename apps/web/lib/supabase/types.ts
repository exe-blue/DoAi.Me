// Re-export Database types from auto-generated file
// To regenerate: npx supabase gen types typescript --project-id <project-ref> > lib/supabase/database.types.ts
// Production devices table uses serial_number, pc_id, last_heartbeat; regenerate from linked project if types differ.
export type { Json, Database } from "./database.types";
import type { Database } from "./database.types";

// Table name union
export type TableName = keyof Database["public"]["Tables"];

// Generic helpers
type Tables = Database["public"]["Tables"];
export type Row<T extends TableName> = Tables[T]["Row"];
export type Insert<T extends TableName> = Tables[T]["Insert"];
export type Update<T extends TableName> = Tables[T]["Update"];

// Convenience row type aliases (used by 30+ files across the codebase)
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
export type SettingRow = Tables["settings"]["Row"];
export type CommandLogRow = Tables["command_logs"]["Row"];

// Insert type aliases
export type WorkerInsert = Tables["workers"]["Insert"];
export type DeviceInsert = Tables["devices"]["Insert"];
export type TaskInsert = Tables["tasks"]["Insert"];
export type TaskLogInsert = Tables["task_logs"]["Insert"];
export type TaskDeviceInsert = Tables["task_devices"]["Insert"];
export type ProxyInsert = Tables["proxies"]["Insert"];
export type ChannelInsert = Tables["channels"]["Insert"];
export type VideoInsert = Tables["videos"]["Insert"];
export type ScheduleInsert = Tables["schedules"]["Insert"];
export type SettingInsert = Tables["settings"]["Insert"];
export type CommandLogInsert = Tables["command_logs"]["Insert"];

// Update type aliases
export type WorkerUpdate = Tables["workers"]["Update"];
export type DeviceUpdate = Tables["devices"]["Update"];
export type TaskUpdate = Tables["tasks"]["Update"];
export type TaskLogUpdate = Tables["task_logs"]["Update"];
export type TaskDeviceUpdate = Tables["task_devices"]["Update"];
export type SettingUpdate = Tables["settings"]["Update"];
export type CommandLogUpdate = Tables["command_logs"]["Update"];
