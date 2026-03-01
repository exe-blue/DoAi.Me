import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isSupportedAction,
  YOUTUBE_COMMANDER_ACTIONS,
} from "../commander-actions";

export const dynamic = "force-dynamic";

type CommandBody = {
  command: {
    action: string;
    params?: Record<string, unknown>;
    fail_stop?: boolean;
  };
  devices?: string;
  device_count?: number;
  pc_id?: string;
  step_delay?: number;
};

async function resolveTargetDevices(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  pc_id: string | null,
  devicesHint?: string,
): Promise<{ target_devices: string[]; devicesLabel: string }> {
  if (devicesHint && devicesHint !== "all") {
    const list = devicesHint
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { target_devices: list, devicesLabel: devicesHint };
  }
  if (!pc_id) return { target_devices: [], devicesLabel: "" };
  const { data } = await supabase
    .from("devices")
    .select("serial, connection_id")
    .eq("pc_id", pc_id)
    .in("status", ["online", "busy"]);
  const targets = (data || [])
    .map((d) => d.connection_id || d.serial)
    .filter(Boolean);
  return { target_devices: targets, devicesLabel: targets.join(",") };
}

/**
 * POST /api/youtube/command
 * Enqueue a single YouTube Commander command as a task.
 * Agent: run_script (uploadFile cmd.json → autojsCreate youtube_commander.js → cmd.json 읽어 실행).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CommandBody;
    const {
      command,
      devices: devicesHint,
      device_count,
      pc_id,
      step_delay,
    } = body;

    if (!command?.action || typeof command.action !== "string") {
      return NextResponse.json(
        { error: "command.action (string) is required" },
        { status: 400 },
      );
    }

    if (!isSupportedAction(command.action)) {
      return NextResponse.json(
        {
          error: `Unknown action: ${command.action}`,
          available: Object.keys(YOUTUBE_COMMANDER_ACTIONS),
        },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { target_devices, devicesLabel } = await resolveTargetDevices(
      supabase,
      pc_id ?? null,
      devicesHint,
    );
    if (target_devices.length === 0) {
      return NextResponse.json(
        {
          error:
            "No target devices (set pc_id and ensure online/busy devices, or pass devices list)",
        },
        { status: 400 },
      );
    }

    const payload = {
      devices: devicesLabel,
      script_path: "youtube_commander.js",
      cmd: {
        action: command.action,
        params: command.params ?? {},
        failStop: command.fail_stop ?? false,
      },
      step_delay: step_delay ?? 500,
    };

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        type: "youtube",
        task_type: "run_script",
        status: "pending",
        payload,
        target_devices: target_devices,
        ...(pc_id ? { pc_id } : {}),
      } as any)
      .select("id, status, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        task_id: task.id,
        status: task.status,
        created_at: task.created_at,
        command: payload.cmd,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[youtube/command]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create command task",
      },
      { status: 500 },
    );
  }
}
