import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FullEngageBody = {
  watch_ms?: number;
  comment_text?: string | null;
  subscribe?: boolean;
  device_count?: number;
  pc_id?: string;
};

/**
 * POST /api/youtube/full-engage
 * Enqueue a full-engage scenario: wait_ad → like → optional comment → optional subscribe.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FullEngageBody;
    const {
      watch_ms = 20000,
      comment_text,
      subscribe = false,
      device_count = 20,
      pc_id,
    } = body;

    const commands: { action: string; params?: Record<string, unknown>; failStop?: boolean }[] = [
      { action: "wait_ad" },
      { action: "like" },
    ];
    if (comment_text) commands.push({ action: "comment", params: { text: comment_text } });
    if (subscribe) commands.push({ action: "subscribe" });

    const payload = {
      commands,
      stepDelay: 500,
    };

    const supabase = createSupabaseServerClient();
    const { data: task, error } = await supabase
      .from("tasks")
      .insert({
        type: "youtube",
        task_type: "youtube_pipeline",
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
      commands: commands.map((c) => c.action),
    }, { status: 201 });
  } catch (err) {
    console.error("[youtube/full-engage]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create full-engage task" },
      { status: 500 }
    );
  }
}
