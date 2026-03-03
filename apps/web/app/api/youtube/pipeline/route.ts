import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  isSupportedAction,
  YOUTUBE_COMMANDER_ACTIONS,
} from "../commander-actions";

export const dynamic = "force-dynamic";

type CommandItem = {
  action: string;
  params?: Record<string, unknown>;
  fail_stop?: boolean;
};
type PipelineBody = {
  commands: CommandItem[];
  step_delay?: number;
  devices?: string;
  device_count?: number;
  worker_id?: string;
};

/**
 * POST /api/youtube/pipeline
 * Enqueue a YouTube Commander pipeline as run_script (uploadFile cmd.json → autojsCreate youtube_commander.js).
 */
async function resolveTargetDevices(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  worker_id: string | null,
  devicesHint?: string,
): Promise<{ target_devices: string[]; devicesLabel: string }> {
  if (devicesHint && devicesHint !== "all") {
    const list = devicesHint
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return { target_devices: list, devicesLabel: devicesHint };
  }
  if (!worker_id) {
    return { target_devices: [], devicesLabel: "" };
  }
  const { data: rawData } = await (supabase as any)
    .from("devices")
    .select("serial")
    .eq("worker_id", worker_id)
    .in("status", ["online", "busy"]);
  const data = rawData as Array<{ serial: string | null }> | null;
  const targets = (data || [])
    .map((d) => d.serial)
    .filter(Boolean);
  return { target_devices: targets, devicesLabel: targets.join(",") };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PipelineBody;
    const { commands, step_delay = 500, devices: devicesHint, worker_id } = body;

    if (!Array.isArray(commands) || commands.length === 0) {
      return NextResponse.json(
        { error: "commands (non-empty array) is required" },
        { status: 400 },
      );
    }

    const unknown = commands
      .filter((c) => c?.action && !isSupportedAction(c.action))
      .map((c) => c.action);
    if (unknown.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown actions: ${unknown.join(", ")}`,
          available: Object.keys(YOUTUBE_COMMANDER_ACTIONS),
        },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { target_devices, devicesLabel } = await resolveTargetDevices(
      supabase,
      worker_id ?? null,
      devicesHint,
    );
    if (target_devices.length === 0) {
      return NextResponse.json(
        {
          error:
            "No target devices (set worker_id and ensure online/busy devices, or pass devices list)",
        },
        { status: 400 },
      );
    }

    const payload = {
      devices: devicesLabel,
      script_path: "youtube_commander.js",
      commands: commands.map((c) => ({
        action: c.action,
        params: c.params ?? {},
        failStop: c.fail_stop ?? false,
      })),
      step_delay,
    };

    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        type: "youtube",
        task_type: "run_script",
        status: "pending",
        payload,
        target_devices: target_devices,
        ...(worker_id ? { worker_id } : {}),
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
        command_count: commands.length,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[youtube/pipeline]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to create pipeline task",
      },
      { status: 500 },
    );
  }
}
