import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// task_queue is not yet in generated types (migration pending) — cast via helper
const tq = (sb: any) => sb.from("task_queue");

/**
 * GET /api/queue
 * Query: status (default 'queued'), limit (default 50)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "queued";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    let query = tq(supabase)
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(limit);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const { count: queuedCount } = await tq(supabase)
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");

    const { count: runningCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "running");

    return NextResponse.json({
      items: data ?? [],
      stats: {
        queued: queuedCount ?? 0,
        running: runningCount ?? 0,
      },
    });
  } catch (error) {
    console.error("Error fetching queue:", error);
    return NextResponse.json({ error: "Failed to fetch queue" }, { status: 500 });
  }
}

/**
 * POST /api/queue
 * Body: { task_config, priority? }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    if (!body.task_config || typeof body.task_config !== "object") {
      return NextResponse.json({ error: "task_config (object) is required" }, { status: 400 });
    }

    const { data, error } = await tq(supabase)
      .insert({
        task_config: body.task_config,
        priority: typeof body.priority === "number" ? body.priority : 0,
        status: "queued",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating queue item:", error);
    return NextResponse.json({ error: "Failed to create queue item" }, { status: 500 });
  }
}

/**
 * DELETE /api/queue
 * Body: { ids: [] }
 * Bulk cancel (only queued items).
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }

    const { data, error } = await tq(supabase)
      .update({ status: "cancelled" })
      .in("id", ids)
      .eq("status", "queued")
      .select("id");

    if (error) throw error;

    return NextResponse.json({ cancelled: data?.length ?? 0, requested: ids.length });
  } catch (error) {
    console.error("Error cancelling queue items:", error);
    return NextResponse.json({ error: "Failed to cancel queue items" }, { status: 500 });
  }
}
