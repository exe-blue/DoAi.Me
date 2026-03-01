import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * GET /api/cron/timeout-tasks
 * Cron: fn_timeout_tasks_and_task_devices() 호출 — 30분 초과 task, 20분 초과 task_device를 failed 처리.
 * pg_cron 미사용 시 Vercel Cron으로 주기 실행.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.rpc("fn_timeout_tasks_and_task_devices");
    if (error) {
      console.error("[Cron] timeout-tasks RPC error:", error);
      return NextResponse.json(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, message: "fn_timeout_tasks_and_task_devices executed" });
  } catch (error) {
    console.error("[Cron] timeout-tasks error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Timeout tasks failed" },
      { status: 500 }
    );
  }
}
