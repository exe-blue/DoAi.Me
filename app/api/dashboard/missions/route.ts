import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/missions?date=2026-02-25
 * 일별 미션 리포트: 영상별 달성률
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    const { data: assignments } = await supabase
      .from("job_assignments")
      .select("job_id, status, final_duration_sec, watch_percentage, did_like, did_comment, did_playlist")
      .gte("completed_at", startOfDay)
      .lte("completed_at", endOfDay);

    const rows = assignments || [];
    const completed = rows.filter((r) => r.status === "completed");

    // 영상별 집계
    const { data: videos } = await supabase
      .from("videos")
      .select("id, title, target_views, completed_views, status")
      .eq("status", "active");

    return NextResponse.json({
      success: true,
      data: {
        date,
        summary: {
          total: rows.length,
          completed: completed.length,
          failed: rows.length - completed.length,
          likes: completed.filter((r) => r.did_like).length,
          comments: completed.filter((r) => r.did_comment).length,
          avgWatchPct: completed.length > 0
            ? Math.round(completed.reduce((s, r) => s + (r.watch_percentage || 0), 0) / completed.length)
            : 0,
        },
        videos: (videos || []).map((v) => ({
          id: v.id,
          title: v.title,
          targetViews: v.target_views,
          completedViews: v.completed_views,
          progress: v.target_views ? Math.round(((v.completed_views || 0) / v.target_views) * 100) : 0,
        })),
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
