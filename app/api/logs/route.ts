import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { TaskLogRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
    const taskId = searchParams.get("task_id");

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("task_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const { data, error, count } = await query.returns<TaskLogRow[]>();

    if (error) throw error;

    return NextResponse.json({
      logs: data ?? [],
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
