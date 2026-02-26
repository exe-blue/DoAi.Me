import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { computeNextRun, validateCron } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";

const ts = (sb: any) => sb.from("task_schedules");

/**
 * PUT /api/schedules/{id}
 * Update name, cron_expression (recompute next_run_at), task_config, is_active.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;
    const body = await request.json();

    const updateFields: Record<string, unknown> = {};

    if (body.name !== undefined) updateFields.name = body.name;
    if (body.task_config !== undefined) updateFields.task_config = body.task_config;
    if (body.is_active !== undefined) updateFields.is_active = body.is_active;

    if (body.cron_expression !== undefined) {
      const cronCheck = validateCron(body.cron_expression);
      if (!cronCheck.valid) {
        return NextResponse.json(
          { error: `Invalid cron expression: ${cronCheck.error}` },
          { status: 400 }
        );
      }
      updateFields.cron_expression = body.cron_expression;
      updateFields.next_run_at = computeNextRun(body.cron_expression);
    }

    if (Object.keys(updateFields).length === 0) {
      return NextResponse.json(
        { error: "Nothing to update" },
        { status: 400 }
      );
    }

    const { data, error } = await ts(supabase)
      .update(updateFields)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ schedule: data });
  } catch (error) {
    console.error("Error updating schedule:", error);
    return NextResponse.json(
      { error: "Failed to update schedule" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/schedules/{id}
 * Hard delete.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

    const { error } = await ts(supabase)
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting schedule:", error);
    return NextResponse.json(
      { error: "Failed to delete schedule" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schedules/{id}/trigger — handled by /api/schedules/[id]/trigger/route.ts
 * This file only handles PUT and DELETE.
 */
