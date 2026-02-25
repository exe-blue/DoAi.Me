import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { isSupportedAction, YOUTUBE_COMMANDER_ACTIONS } from "../commander-actions";

export const dynamic = "force-dynamic";

type CommandItem = { action: string; params?: Record<string, unknown>; fail_stop?: boolean };
type PipelineBody = {
  commands: CommandItem[];
  step_delay?: number;
  devices?: string;
  device_count?: number;
  pc_id?: string;
};

/**
 * POST /api/youtube/pipeline
 * Enqueue a YouTube Commander pipeline as run_script (uploadFile cmd.json → autojsCreate youtube_commander.js).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PipelineBody;
    const { commands, step_delay = 500, devices = "all", pc_id } = body;

    if (!Array.isArray(commands) || commands.length === 0) {
      return NextResponse.json(
        { error: "commands (non-empty array) is required" },
        { status: 400 }
      );
    }

    const unknown = commands
      .filter((c) => c?.action && !isSupportedAction(c.action))
      .map((c) => c.action);
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: `Unknown actions: ${unknown.join(", ")}`, available: Object.keys(YOUTUBE_COMMANDER_ACTIONS) },
        { status: 400 }
      );
    }

    const payload = {
      devices,
      script_path: "youtube_commander.js",
      commands: commands.map((c) => ({
        action: c.action,
        params: c.params ?? {},
        failStop: c.fail_stop ?? false,
      })),
      step_delay,
    };

    const supabase = createServerClient();
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        type: "youtube",
        task_type: "run_script",
        status: "pending",
        payload,
        ...(pc_id ? { pc_id } : {}),
      } as any)
      .select("id, status, created_at")
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      task_id: task.id,
      status: task.status,
      created_at: task.created_at,
      command_count: commands.length,
    }, { status: 201 });
  } catch (err) {
    console.error("[youtube/pipeline]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create pipeline task" },
      { status: 500 }
    );
  }
}
