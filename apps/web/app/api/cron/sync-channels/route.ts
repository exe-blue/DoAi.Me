/**
 * Cron: sync monitored channels (recent videos + enqueue active to task_queue).
 * Vercel cron: GET every minute. Secure with CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSyncChannels();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/sync-channels]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
