import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { createTaskWithTaskDevices } from "@/lib/pipeline";
import {
  DEFAULT_WATCH_WORKFLOW_ID,
  DEFAULT_WATCH_WORKFLOW_VERSION,
} from "@/lib/workflow-snapshot";
import type { CommandLogRow } from "@/lib/supabase/types";
import { okList, ok, err, errFrom, parseListParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parseListParams(searchParams);
    const before = searchParams.get("before");

    let query = supabase
      .from("command_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (before) query = query.lt("created_at", before);

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query.returns<CommandLogRow[]>();
    if (error) throw error;

    return okList(data ?? [], { page, pageSize, total: count ?? data?.length ?? 0 });
  } catch (e) {
    return errFrom(e, "COMMANDS_ERROR", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json();
    const { command, target_type, target_serials } = body;

    if (!command || !command.trim()) {
      return err("BAD_REQUEST", "command is required", 400);
    }

    const BLOCKED = [
      /rm\s+-rf/i,
      /format\s+/i,
      /factory[_\s]?reset/i,
      /wipe\s+/i,
      /flash\s+/i,
      /dd\s+if=/i,
    ];
    if (BLOCKED.some((p) => p.test(command))) {
      return err("BLOCKED", "Command blocked by safety filter", 400);
    }

    const trimmedCommand = command.trim();

    const { data: commandLog, error: logError } = await supabase
      .from("command_logs")
      .insert({
        command: trimmedCommand,
        target_type: target_type || "all",
        target_serials: target_serials ?? null,
        status: "pending",
        initiated_by: "dashboard",
      })
      .select()
      .single()
      .returns<CommandLogRow>();

    if (logError) throw logError;

    type DeviceRow = { id: string; serial: string; worker_id: string | null };
    let deviceRows: DeviceRow[] = [];
    if (
      Array.isArray(target_serials) &&
      target_serials.length > 0 &&
      target_serials.every((s: unknown) => typeof s === "string")
    ) {
      const { data } = await supabase
        .from("devices")
        .select("id, serial, worker_id")
        .in("serial", target_serials as string[])
        .returns<DeviceRow[]>();
      deviceRows = data ?? [];
    } else {
      const { data: workers } = await supabase.from("workers").select("id");
      for (const w of workers ?? []) {
        const { data: devs } = await supabase
          .from("devices")
          .select("id, serial, worker_id")
          .eq("worker_id", w.id)
          .limit(20)
          .returns<DeviceRow[]>();
        deviceRows = deviceRows.concat(devs ?? []);
      }
    }

    const task = await createTaskWithTaskDevices({
      taskPayload: {
        type: "adb",
        task_type: "direct",
        video_id: null,
        channel_id: null,
        payload: {
          command: trimmedCommand,
          command_log_id: commandLog.id,
        },
        status: "pending",
      },
      workflowId: DEFAULT_WATCH_WORKFLOW_ID,
      workflowVersion: DEFAULT_WATCH_WORKFLOW_VERSION,
      inputs: { command: trimmedCommand },
      deviceIds:
        deviceRows.length > 0
          ? deviceRows
              .filter((d) => d.worker_id != null)
              .map((d) => ({ id: d.id, serial: d.serial, pc_id: d.worker_id! }))
          : undefined,
    });

    return ok({ command_id: commandLog.id, task_id: task.id }, 201);
  } catch (e) {
    return errFrom(e, "COMMAND_CREATE_ERROR", 500);
  }
}
