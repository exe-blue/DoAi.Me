/**
 * GET /api/logs — list execution_logs for Events/Logs dashboard.
 * Agent writes to execution_logs via supabase-sync insertExecutionLog().
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const task_id = searchParams.get("task_id") ?? undefined;
  const device_id = searchParams.get("device_id") ?? undefined;
  const level = searchParams.get("level") ?? undefined;

  try {
    const supabase = createSupabaseServerClient();
    let q = supabase
      .from("execution_logs")
      .select("id, execution_id, device_id, status, level, message, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (task_id) q = q.eq("execution_id", task_id);
    if (device_id) q = q.eq("device_id", device_id);
    if (level) q = q.eq("level", level);

    const { data, error } = await q;

    if (error) {
      console.error("[api/logs]", error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const logs = (data ?? []).map((row) => ({
      id: row.id,
      task_id: row.execution_id,
      device_serial: row.device_id ?? undefined,
      level: row.level ?? "info",
      message: row.message ?? "",
      created_at: row.created_at,
      raw: row,
    }));

    return NextResponse.json({ success: true, logs });
  } catch (err) {
    console.error("[api/logs]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
