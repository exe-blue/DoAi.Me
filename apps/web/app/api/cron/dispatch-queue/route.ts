import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runDispatchQueue } from "@/lib/dispatch-queue-runner";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

async function verifySupabaseScheduleAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return false;

  const expectedSecret = process.env.SUPABASE_CRON_SECRET;
  if (!expectedSecret) {
    console.error("[Cron Auth] SUPABASE_CRON_SECRET is not configured - cron authentication will fail");
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  try {
    const tokenBuffer = Buffer.from(token, "utf8");
    const secretBuffer = Buffer.from(expectedSecret, "utf8");
    if (tokenBuffer.length !== secretBuffer.length) return false;
    return timingSafeEqual(tokenBuffer, secretBuffer);
  } catch {
    return false;
  }
}

/**
 * POST /api/cron/dispatch-queue
 * Supabase Scheduled Functions 또는 pg_cron + HTTP 호출에서 실행되는 내부 스케줄 엔드포인트.
 */
export async function POST(request: Request) {
  if (!(await verifySupabaseScheduleAuth(request))) {
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
