import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildConfigFromWorkflow,
  DEFAULT_WATCH_WORKFLOW_ID,
  DEFAULT_WATCH_WORKFLOW_VERSION,
} from "@/lib/workflow-snapshot";

export const dynamic = "force-dynamic";

const ts = (sb: any) => sb.from("task_schedules");
const tq = (sb: any) => sb.from("task_queue");

function hasSnapshotSteps(
  config: unknown,
): config is { snapshot: { steps: unknown[] } } {
  const c = config as Record<string, unknown> | null | undefined;
  const snap = c?.snapshot as { steps?: unknown[] } | undefined;
  return Array.isArray(snap?.steps) && snap.steps.length > 0;
}

/**
 * POST /api/schedules/{id}/trigger
 * Manual trigger: immediately inserts into task_queue (ignores cron timing).
 * task_config uses buildConfigFromWorkflow when snapshot.steps is missing.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = createSupabaseServerClient();
    const { id } = await params;

    const { data: schedule, error: fetchErr } = await ts(supabase)
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr) {
      if (fetchErr.code === "PGRST116") {
        return NextResponse.json(
          { error: "Schedule not found" },
          { status: 404 },
        );
      }
      throw fetchErr;
    }

    const sc = (schedule.task_config ?? {}) as Record<string, unknown>;
    let taskConfig: Record<string, unknown>;
    if (hasSnapshotSteps(sc)) {
      taskConfig = { ...sc, _schedule_id: schedule.id, _manual_trigger: true };
    } else {
      const inputs = (sc.inputs as Record<string, unknown>) ?? {};
      const videoId = (inputs.videoId ??
        sc.videoId ??
        sc.video_id ??
        "") as string;
      const channelId = (inputs.channelId ??
        sc.channelId ??
        sc.channel_id ??
        "") as string;
      const built = await buildConfigFromWorkflow(
        DEFAULT_WATCH_WORKFLOW_ID,
        DEFAULT_WATCH_WORKFLOW_VERSION,
        {
          videoId,
          channelId,
          keyword: (inputs.keyword as string) ?? videoId,
          video_url:
            (inputs.video_url as string) ??
            (videoId
              ? `https://www.youtube.com/watch?v=${videoId}`
              : undefined),
        },
      );
      taskConfig = {
        ...sc,
        ...built,
        _schedule_id: schedule.id,
        _manual_trigger: true,
      };
    }

    const insertRow: Record<string, unknown> = {
      task_config: taskConfig,
      priority: 5,
      status: "queued",
    };
    try {
      const { data: probe } = await tq(supabase)
        .select("source")
        .limit(1)
        .maybeSingle();
      if (probe && "source" in probe) insertRow.source = "channel_auto";
    } catch {
      // source column may not exist
    }
    const { data: queueItem, error: insertErr } = await tq(supabase)
      .insert(insertRow)
      .select()
      .single();

    if (insertErr) throw insertErr;

    return NextResponse.json({
      triggered: true,
      queue_item: queueItem,
      schedule_name: schedule.name,
    });
  } catch (error) {
    console.error("Error triggering schedule:", error);
    return NextResponse.json(
      { error: "Failed to trigger schedule" },
      { status: 500 },
    );
  }
}
