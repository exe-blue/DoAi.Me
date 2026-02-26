import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/realtime
 * 실시간 대시보드 데이터: 기기 상태, 오늘 통계, PC별 요약
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    // 기기 상태 집계
    const [
      { count: total },
      { count: online },
      { count: offline },
      { count: busy },
      { count: error },
    ] = await Promise.all([
      supabase.from("devices").select("*", { count: "exact", head: true }),
      supabase.from("devices").select("*", { count: "exact", head: true }).eq("status", "online"),
      supabase.from("devices").select("*", { count: "exact", head: true }).eq("status", "offline"),
      supabase.from("devices").select("*", { count: "exact", head: true }).eq("status", "busy"),
      supabase.from("devices").select("*", { count: "exact", head: true }).eq("status", "error"),
    ]);

    // 오늘 통계
    const today = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";

    const sb = supabase as { from: (t: string) => ReturnType<typeof supabase.from> };
    const [
      { count: views },
      { count: errors },
      { count: activeMissions },
    ] = await Promise.all([
      sb.from("job_assignments").select("*", { count: "exact", head: true })
        .eq("status", "completed").gte("completed_at", today),
      sb.from("job_assignments").select("*", { count: "exact", head: true })
        .eq("status", "failed").gte("created_at", today),
      supabase.from("videos").select("*", { count: "exact", head: true })
        .eq("status", "active"),
    ]);

    // PC별 요약 (pcs not in generated DB types)
    const { data: pcs } = await sb.from("pcs").select("id, pc_number, status, last_heartbeat");

    return NextResponse.json({
      success: true,
      data: {
        totalDevices: total || 0,
        online: online || 0,
        offline: offline || 0,
        busy: busy || 0,
        error: error || 0,
        activeMissions: activeMissions || 0,
        todayStats: { views: views || 0, errors: errors || 0 },
        pcs: pcs || [],
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
