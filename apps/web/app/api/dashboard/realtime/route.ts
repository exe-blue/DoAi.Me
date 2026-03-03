import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/realtime
 * 초기 스냅샷 전용: 집계 테이블(dashboard_metrics) 단건 조회.
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const sb = supabase as any;

    const { data, error } = await sb
      .from("dashboard_metrics")
      .select("*")
      .eq("key", "global")
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data ?? {
        key: "global",
        devices_total: 0,
        devices_online: 0,
        devices_busy: 0,
        devices_offline: 0,
        devices_error: 0,
        workers_total: 0,
        workers_online: 0,
        workers_error: 0,
        last_worker_heartbeat: null,
        worker_heartbeat_stale: 0,
        error_count_24h: 0,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
