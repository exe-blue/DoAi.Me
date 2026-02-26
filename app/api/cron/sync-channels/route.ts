import { NextResponse } from "next/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
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
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json(result);
}
