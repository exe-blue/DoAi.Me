import { NextResponse } from "next/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";
import { verifyScheduleSecret } from "@/lib/cron-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/cron/sync-channels
 * Supabase pg_cron + HTTP 호출에서 실행되는 내부 스케줄 엔드포인트.
 */
export async function POST(request: Request) {
  if (!verifyScheduleSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSyncChannels();
  if (!result.ok) {
    const err = "error" in result ? result.error : "Sync failed";
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json(result);
}
