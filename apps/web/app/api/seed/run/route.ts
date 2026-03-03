/**
 * One-time seed: 5 channels, 2 videos each, enqueue 10. Secure with CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { runSeedChannels } from "@/lib/seed-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSeedChannels();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[seed/run]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 }
    );
  }
}
