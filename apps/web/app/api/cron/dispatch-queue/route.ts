/**
 * Cron: dequeue one task_queue item and create task + task_devices.
 * Vercel cron: GET every minute. Secure with CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { runDispatchQueue } from "@/lib/dispatch-queue-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDispatchQueue();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[cron/dispatch-queue]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Dispatch failed" },
      { status: 500 }
    );
  }
}
