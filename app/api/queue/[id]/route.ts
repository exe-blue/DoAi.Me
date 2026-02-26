import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const tq = (sb: any) => sb.from("task_queue");

/**
 * PUT /api/queue/{id}
 * Update priority or task_config (only if status='queued').
 */
export async function PUT(
  request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { id } = await params;
    const body = await request.json();

    const updateFields: Record<string, unknown> = {};
    if (typeof body.priority === "number") updateFields.priority = body.priority;
    if (body.source === "manual" || body.source === "channel_auto") updateFields.source = body.source;
    if (body.task_config && typeof body.task_config === "object") {
      updateFields.task_config = body.task_config;
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update (provide priority or task_config)" },
        { status: 400 }
      );
    }

    const { data, error } = await tq(supabase)
      .update(updateFields)
      .eq("id", id)
      .eq("status", "queued")
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Queue item not found or not in queued status" },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("Error updating queue item:", error);
    return NextResponse.json({ error: "Failed to update queue item" }, { status: 500 });
  }
}

/**
 * DELETE /api/queue/{id}
 * Cancel a single queued item.
 */
export async function DELETE(
  request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServerClient();
    const { id } = await params;

    const { data, error } = await tq(supabase)
      .update({ status: "cancelled" })
      .eq("id", id)
      .eq("status", "queued")
      .select("id")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Queue item not found or already dispatched/cancelled" },
          { status: 404 }
        );
      }
      throw error;
    }

    return NextResponse.json({ cancelled: true, id: data.id });
  } catch (error) {
    console.error("Error cancelling queue item:", error);
    return NextResponse.json({ error: "Failed to cancel queue item" }, { status: 500 });
  }
}
