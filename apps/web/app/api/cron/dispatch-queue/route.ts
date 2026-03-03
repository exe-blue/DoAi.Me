import { NextResponse } from "next/server";
import { runDispatchQueue } from "@/lib/dispatch-queue-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Verify the shared secret for Supabase scheduled jobs (pg_cron).
 * Compares the Bearer token from the Authorization header against APP_SCHEDULE_SECRET.
 * This avoids the issue of using supabase.auth.getUser() with a static JWT that would expire.
 */
function verifyScheduleSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return false;

  const expectedSecret = process.env.APP_SCHEDULE_SECRET;
  if (!expectedSecret) {
    console.error("[verifyScheduleSecret] APP_SCHEDULE_SECRET not configured");
    return false;
  }

  return token === expectedSecret;
}

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
