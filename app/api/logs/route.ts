import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TaskLogRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);

    const taskId = searchParams.get("task_id");
    const limit = Math.min(
      parseInt(searchParams.get("limit") || "200"),
      1000
    );

    let query = supabase
      .from("task_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    const deviceId = searchParams.get("device_id");
    if (deviceId) query = query.eq("device_serial", deviceId);

    const level = searchParams.get("level");
    if (level) {
      const levels = level.split(",").map((l) => l.trim()) as any[];
      query = query.in("level", levels);
    }

    const search = searchParams.get("search");
    if (search) query = query.ilike("message", `%${search}%`);

    const before = searchParams.get("before");
    if (before) query = query.lt("created_at", before);

    const { data, error } = await query.returns<TaskLogRow[]>();

    if (error) throw error;

    return NextResponse.json({ logs: data ?? [] });
  } catch (error) {
    console.error("Error fetching logs:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch logs",
      },
      { status: 500 }
    );
  }
}
