/**
 * Cron: mark tasks pending 24h with no device progress as failed; set video status to assignment_failed.
 * Call from same 1-min cron or separately (e.g. every 10 min).
 */
import { NextResponse } from "next/server";
import { runAssignmentTimeout } from "@/lib/assignment-timeout-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAssignmentTimeout();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/assignment-timeout]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Timeout failed" },
      { status: 500 }
    );
  }
}
