import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CommandLogRow, TaskDeviceInsert } from "@/lib/supabase/types";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);

    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 100);
    const before = searchParams.get("before");

    let query = supabase
      .from("command_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      query = query.lt("created_at", before);
    }

    const { data, error } = await query.returns<CommandLogRow[]>();
    if (error) throw error;

    return NextResponse.json({ commands: data });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch commands",
      },
      { status: 500 },
    );
  }
}

/** Minimal config for command task_devices (no workflow snapshot from DB). */
function buildCommandTaskDeviceConfig(command: string): Json {
  return {
    schemaVersion: 1,
    workflow: {
      id: "COMMAND",
      version: 1,
      kind: "EVENT",
      name: "RUN_COMMAND",
    },
    snapshot: {
      createdAt: new Date().toISOString(),
      steps: [],
    },
    inputs: { command },
    runtime: {
      timeouts: { stepTimeoutSec: 60, taskTimeoutSec: 120 },
    },
  } as unknown as Json;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();
    const { command, target_type, target_serials } = body;

    if (!command || !command.trim()) {
      return NextResponse.json(
        { error: "command is required" },
        { status: 400 },
      );
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
      return NextResponse.json(
        { error: "Command blocked by safety filter" },
        { status: 400 },
      );
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

    let devices: Array<{ id: string; serial: string; pc_id: string | null }> =
      [];
    if (
      Array.isArray(target_serials) &&
      target_serials.length > 0 &&
      target_serials.every((s: unknown) => typeof s === "string")
    ) {
      const { data: bySerials } = await supabase
        .from("devices")
        .select("id, serial, pc_id")
        .in("serial", target_serials as string[])
        .returns<Array<{ id: string; serial: string; pc_id: string | null }>>();
      devices = bySerials ?? [];
    } else {
      const { data: pcs } = await supabase
        .from("pcs")
        .select("id")
        .returns<Array<{ id: string }>>();
      const pcList = pcs?.data ?? pcs ?? [];
      const perPc = 20;
      for (const pc of pcList) {
        const { data: devs } = await supabase
          .from("devices")
          .select("id, serial, pc_id")
          .eq("pc_id", (pc as { id: string }).id)
          .limit(perPc)
          .returns<
            Array<{ id: string; serial: string; pc_id: string | null }>
          >();
        devices = devices.concat(devs ?? []);
      }
    }

    const config = buildCommandTaskDeviceConfig(trimmedCommand);

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        type: "adb",
        task_type: "direct",
        video_id: null,
        channel_id: null,
        payload: { command: trimmedCommand, command_log_id: commandLog.id },
        status: "pending",
      })
      .select("id")
      .single();

    if (taskError) throw taskError;
    if (!task?.id) throw new Error("Task insert did not return id");

    const taskDevices: TaskDeviceInsert[] = devices.map((d) => ({
      task_id: task.id,
      device_serial: d.serial,
      status: "pending",
      config,
      worker_id: null,
      ...(d.id ? { device_id: d.id } : {}),
      ...(d.pc_id ? { pc_id: d.pc_id } : {}),
    }));

    if (taskDevices.length > 0) {
      const withDeviceId = taskDevices.filter(
        (r) => (r as { device_id?: string }).device_id != null,
      );
      const withoutDeviceId = taskDevices.filter(
        (r) => (r as { device_id?: string }).device_id == null,
      );
      if (withDeviceId.length > 0) {
        const { error: uErr } = await supabase
          .from("task_devices")
          .upsert(withDeviceId, {
            onConflict: "task_id,device_id",
            ignoreDuplicates: true,
          });
        if (uErr) throw uErr;
      }
      if (withoutDeviceId.length > 0) {
        const { error: iErr } = await supabase
          .from("task_devices")
          .insert(withoutDeviceId);
        if (iErr) throw iErr;
      }
    }

    return NextResponse.json(
      { command_id: commandLog.id, task_id: task.id },
      { status: 201 },
    );
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create command",
      },
      { status: 500 },
    );
  }
}
