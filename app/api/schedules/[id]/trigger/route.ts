import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ts = (sb: any) => sb.from("task_schedules");
const tq = (sb: any) => sb.from("task_queue");

/**
 * POST /api/schedules/{id}/trigger
 * Manual trigger: immediately inserts into task_queue (ignores cron timing).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

    // Fetch the schedule
    const { data: schedule, error: fetchErr } = await ts(supabase)
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr) {
      if (fetchErr.code === "PGRST116") {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      }
      throw fetchErr;
    }

    const insertRow: Record<string, unknown> = {
      task_config: {
        ...schedule.task_config,
        _schedule_id: schedule.id,
        _manual_trigger: true,
      },
      priority: 5,
      status: "queued",
    };
    try {
      const { data: probe } = await tq(supabase).select("source").limit(1).maybeSingle();
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
      { status: 500 }
    );
  }
}
