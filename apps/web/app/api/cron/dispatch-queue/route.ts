import { NextResponse } from "next/server";
import { runDispatchQueue } from "@/lib/dispatch-queue-runner";
import { verifyScheduleSecret } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/cron/dispatch-queue
 * Supabase pg_cron + HTTP 호출에서 실행되는 내부 스케줄 엔드포인트.
 */
export async function POST(request: Request) {
  if (!verifyScheduleSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDispatchQueue();
    if (!result.ok) return NextResponse.json({ error: (result as { ok: false; error: string }).error }, { status: 500 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Cron] Dispatch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dispatch failed" },
      { status: 500 }
    );
  }
}
