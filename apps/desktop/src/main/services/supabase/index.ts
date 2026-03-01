/**
 * Supabase client, verify, PC register/lookup, updatePcStatus.
 * Renderer must not use Supabase directly — main process only.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getSavedPcNumber, setSavedPcNumber } from "../pc-store";

export type { SupabaseClient };

let supabase: SupabaseClient | null = null;
let pcNumber: string | null = null;
let pcUuid: string | null = null;

export function createSupabaseClient(
  url: string,
  anonKey: string,
  serviceRoleKey?: string
): SupabaseClient {
  const key = serviceRoleKey || anonKey;
  supabase = createClient(url, key);
  return supabase;
}

export function getSupabase(): SupabaseClient | null {
  return supabase;
}

export async function verifyConnection(): Promise<void> {
  if (!supabase) throw new Error("Supabase client not created");
  const { error } = await supabase.from("pcs").select("id").limit(1);
  if (error) throw new Error(error.message);
}

/** Get or register PC: return pc_number. Uses electron-store + RPC register_new_pc. */
export async function getOrRegisterPcId(): Promise<string> {
  if (!supabase) throw new Error("Supabase client not created");
  const saved = getSavedPcNumber();
  if (saved) return saved;
  const { data, error } = await supabase.rpc("register_new_pc");
  if (error) throw new Error(`Failed to register new PC: ${error.message}`);
  const num = typeof data === "string" ? data : (data as { pc_number?: string })?.pc_number;
  if (!num || typeof num !== "string") throw new Error("register_new_pc() did not return pc_number");
  setSavedPcNumber(num);
  return num;
}

/** Look up PC by pc_number, set internal pcNumber/pcUuid. */
export async function resolvePcId(pcNumberArg: string): Promise<void> {
  if (!supabase) throw new Error("Supabase client not created");
  const { data, error } = await supabase
    .from("pcs")
    .select("id, pc_number")
    .eq("pc_number", pcNumberArg)
    .single();
  if (data) {
    pcNumber = data.pc_number;
    pcUuid = data.id;
    return;
  }
  if (error && error.code !== "PGRST116") throw new Error(`Failed to lookup PC: ${error.message}`);
  throw new Error(`PC not found: ${pcNumberArg}. Register first via getOrRegisterPcId().`);
}

export async function updatePcStatus(status: string): Promise<void> {
  if (!supabase || !pcUuid) return;
  await supabase
    .from("pcs")
    .update({
      status,
      last_heartbeat: new Date().toISOString(),
    })
    .eq("id", pcUuid);
}

export function getPcNumber(): string | null {
  return pcNumber;
}
export function getPcUuid(): string | null {
  return pcUuid;
}

export {
  claimTaskDevice,
  completeTaskDevice,
  failOrRetryTaskDevice,
  type TaskDeviceRow,
} from "./rpc";
