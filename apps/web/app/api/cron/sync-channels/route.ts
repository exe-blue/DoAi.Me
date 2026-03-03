import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
 * POST /api/cron/sync-channels
 * Supabase Scheduled Functions 또는 pg_cron + HTTP 호출에서 실행되는 내부 스케줄 엔드포인트.
 */
export async function POST(request: Request) {
  if (!(await verifySupabaseScheduleAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSyncChannels();
  if (!result.ok) {
    const err = "error" in result ? result.error : "Sync failed";
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json(result);
}
