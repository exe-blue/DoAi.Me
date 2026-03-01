/**
 * RPC wrapper: claim / complete / fail_or_retry with fallback for PGRST202/42883.
 * Same order and error handling as agent/device/device-orchestrator.js.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TaskDeviceRow {
  id: string;
  device_id?: string;
  device_serial?: string;
  task_id?: string;
  config?: { video_id?: string; [k: string]: unknown };
  [k: string]: unknown;
}

function isMissingRpcOrSignatureError(error: { code?: string; message?: string }, rpcName: string): boolean {
  if (!error) return false;
  const code = String(error.code ?? "").toUpperCase();
  if (code === "PGRST202" || code === "42883") return true;
  const message = String(error.message ?? "").toLowerCase();
  const rpc = String(rpcName ?? "").toLowerCase();
  return (
    message.includes(rpc) &&
    (message.includes("could not find the function") ||
      message.includes("does not exist") ||
      message.includes("no function matches the given name and argument types"))
  );
}

/**
 * Claim 1 task_device. Tries: claim_task_devices_for_pc(runner_pc_name), then (runner_pc_id), then claim_next_task_device.
 */
export async function claimTaskDevice(
  supabase: SupabaseClient,
  pcNumber: string | null,
  pcUuid: string | null,
  serial: string
): Promise<TaskDeviceRow | null> {
  if (!supabase) return null;

  const attempts: { rpc: string; params: Record<string, unknown> }[] = [
    { rpc: "claim_task_devices_for_pc", params: { runner_pc_name: pcNumber, max_to_claim: 1 } },
  ];
  if (pcUuid) {
    attempts.push({ rpc: "claim_task_devices_for_pc", params: { runner_pc_id: pcUuid, max_to_claim: 1 } });
    attempts.push({ rpc: "claim_next_task_device", params: { p_worker_id: pcUuid, p_device_serial: serial } });
  }

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    const { data, error } = await supabase.rpc(attempt.rpc, attempt.params);
    if (!error) {
      const row = Array.isArray(data) ? data[0] : data && typeof data === "object" && "id" in data ? data : null;
      if (!row) return null;
      return row as TaskDeviceRow;
    }
    const hasFallback = i < attempts.length - 1;
    const canFallback = isMissingRpcOrSignatureError(error, attempt.rpc);
    if (hasFallback && canFallback) continue;
    return null;
  }
  return null;
}

/** complete_task_device(p_task_device_id). 0 rows = already terminated (CAS). */
export async function completeTaskDevice(
  supabase: SupabaseClient,
  taskDeviceId: string
): Promise<unknown> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("complete_task_device", { p_task_device_id: taskDeviceId });
  return data;
}

/** fail_or_retry_task_device(p_task_device_id, p_error). 0 rows = already terminated. */
export async function failOrRetryTaskDevice(
  supabase: SupabaseClient,
  taskDeviceId: string,
  errorMessage: string
): Promise<unknown> {
  if (!supabase) return null;
  const { data } = await supabase.rpc("fail_or_retry_task_device", {
    p_task_device_id: taskDeviceId,
    p_error: errorMessage,
  });
  return data;
}
