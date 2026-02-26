import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/screenshots?date=2026-02-25&serial=xxx
 * 작업 타임라인 + 스크린샷 경로 조회
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const serial = searchParams.get("serial");

    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;

    // job_assignments not in generated DB types
    const sb = supabase as { from: (t: string) => ReturnType<typeof supabase.from> };
    let query = sb
      .from("job_assignments")
      .select(`
        id, job_id, device_serial, status, progress_pct,
        final_duration_sec, watch_percentage,
        did_like, did_comment, did_playlist,
        error_log, created_at, started_at, completed_at,
        screenshot_path
      `)
      .gte("created_at", startOfDay)
      .lte("created_at", endOfDay)
      .order("created_at", { ascending: false })
      .limit(100);

    if (serial) {
      query = query.eq("device_serial", serial);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    type JobAssignmentRow = {
      id: string; job_id: string; device_serial: string | null; status: string; progress_pct?: number;
      final_duration_sec?: number; watch_percentage?: number;
      did_like?: boolean; did_comment?: boolean; did_playlist?: boolean;
      error_log?: string | null; created_at?: string | null; started_at?: string | null; completed_at?: string | null;
      screenshot_path?: string | null;
    };
    const rows: JobAssignmentRow[] = (data || []) as unknown as JobAssignmentRow[];

    // 작업을 타임라인 형태로 포맷
    const timeline = rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      serial: row.device_serial,
      status: row.status,
      duration: row.final_duration_sec,
      watchPct: row.watch_percentage,
      actions: {
        liked: row.did_like || false,
        commented: row.did_comment || false,
        saved: row.did_playlist || false,
      },
      error: row.error_log,
      screenshot: row.screenshot_path,
      timestamps: {
        created: row.created_at,
        started: row.started_at,
        completed: row.completed_at,
      },
    }));

    return NextResponse.json({
      success: true,
      data: { date, count: timeline.length, timeline },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
