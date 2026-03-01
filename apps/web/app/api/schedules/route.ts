import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeNextRun, validateCron } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";

const ts = (sb: any) => sb.from("task_schedules");

/**
 * GET /api/schedules
 * Returns all schedules with last_run_at, next_run_at, run_count.
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data, error } = await ts(supabase)
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ schedules: data ?? [] });
  } catch (error) {
    console.error("Error fetching schedules:", error);
    return NextResponse.json(
      { error: "Failed to fetch schedules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/schedules
 * Body: { name, cron_expression, task_config, is_active? }
 * Validate cron syntax. Compute next_run_at. Return created schedule.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();

    // Validate required fields
    if (!body.name || typeof body.name !== "string") {
      return NextResponse.json({ error: "name (string) is required" }, { status: 400 });
    }
    if (!body.cron_expression || typeof body.cron_expression !== "string") {
      return NextResponse.json({ error: "cron_expression (string) is required" }, { status: 400 });
    }
    if (!body.task_config || typeof body.task_config !== "object") {
      return NextResponse.json({ error: "task_config (object) is required" }, { status: 400 });
    }

    // Validate cron syntax
    const cronCheck = validateCron(body.cron_expression);
    if (!cronCheck.valid) {
      return NextResponse.json(
        { error: `Invalid cron expression: ${cronCheck.error}` },
        { status: 400 }
      );
    }

    const nextRunAt = computeNextRun(body.cron_expression);

    const { data, error } = await ts(supabase)
      .insert({
        name: body.name,
        cron_expression: body.cron_expression,
        task_config: body.task_config,
        is_active: body.is_active !== false,
        next_run_at: nextRunAt,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ schedule: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating schedule:", error);
    return NextResponse.json(
      { error: "Failed to create schedule" },
      { status: 500 }
    );
  }
}
