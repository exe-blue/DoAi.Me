import { NextResponse } from "next/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronAuth(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    const env = process.env.NODE_ENV;
    if (env === "development" || env === "test") return true;
    return false;
  }
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${secret}`;
}

/**
 * GET /api/cron/sync-channels
 * Vercel Cron에서 1분마다 호출. YouTube Data API로 최근 영상 조회 후 videos upsert 및 task_queue enqueue.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSyncChannels();
  if (!result.ok) {
    const err = "error" in result ? result.error : "Sync failed";
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json(result);
}
