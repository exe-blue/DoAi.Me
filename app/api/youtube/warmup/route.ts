import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type WarmupBody = {
  mode?: string;
  count?: number;
  watch_duration_min?: number;
  watch_duration_max?: number;
  device_count?: number;
  pc_id?: string;
};

/**
 * POST /api/youtube/warmup
 * Enqueue a YouTube Commander warmup (id preheat) as a task.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WarmupBody;
    const {
      mode = "home",
      count = 3,
      watch_duration_min = 10000,
      watch_duration_max = 30000,
      device_count = 20,
      pc_id,
    } = body;

    const payload = {
      command: {
        action: "warmup",
        params: {
          mode,
          count,
          watchDuration: [watch_duration_min, watch_duration_max],
        },
      },
      stepDelay: 500,
    };

    const supabase = createSupabaseServerClient();
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        type: "youtube",
        task_type: "youtube_command",
        video_id: null,
        channel_id: null,
        device_count,
        payload,
        status: "pending",
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
      warmup_config: { mode, count, watch_duration: [watch_duration_min, watch_duration_max] },
    }, { status: 201 });
  } catch (err) {
    console.error("[youtube/warmup]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create warmup task" },
      { status: 500 }
    );
  }
}
