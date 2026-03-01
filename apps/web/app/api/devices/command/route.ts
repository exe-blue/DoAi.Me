import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { ok, err, errFrom } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const COMMAND_TYPES = new Set([
  "reboot",
  "clear_cache",
  "kill_app",
  "screenshot",
  "enable",
  "disable",
  "set_proxy",
  "clear_proxy",
] as const);

/**
 * POST /api/devices/command
 * Body: { device_ids: string[], command_type: string, options?: object }
 * Enqueues command via command_logs (target_ids = device_ids). For enable/disable also updates devices.status.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json();
    const device_ids = body?.device_ids;
    const command_type = (body?.command_type ?? "").toLowerCase();
    const options = body?.options ?? {};

    if (!Array.isArray(device_ids) || device_ids.length === 0) {
      return err(
        "BAD_REQUEST",
        "device_ids (non-empty array) is required",
        400,
      );
    }
    if (!COMMAND_TYPES.has(command_type as any)) {
      return err(
        "BAD_REQUEST",
        `command_type must be one of: ${[...COMMAND_TYPES].join(", ")}`,
        400,
      );
    }

    const ids = device_ids.filter(
      (id: unknown) => typeof id === "string",
    ) as string[];

    if (command_type === "enable" || command_type === "disable") {
      const newStatus = command_type === "enable" ? "idle" : "offline";
      const { error: updateError } = await supabase
        .from("devices")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .in("id", ids);
      if (updateError) throw updateError;
    }

    const { data: row, error: logError } = await supabase
      .from("command_logs")
      .insert({
        command: command_type,
        target_type: "devices",
        target_ids: ids,
        target_serials: null,
        status: "pending",
        initiated_by: "dashboard",
        results: options && Object.keys(options).length > 0 ? options : null,
      } as any)
      .select("id")
      .single();

    if (logError) throw logError;

    const created = row ? 1 : 0;
    const createdIds = row ? [row.id] : [];

    return ok({ created, ids: createdIds }, 201);
  } catch (e) {
    console.error("Error in devices/command:", e);
    return errFrom(e, "COMMAND_ERROR", 500);
  }
}
