import { NextResponse } from "next/server";
import { runDispatchQueue } from "@/lib/dispatch-queue-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * GET /api/cron/dispatch-queue
 * Cron: 대기열 1건을 tasks로 디스패치 (PC별 task_devices 생성 → 각 PC Agent가 영상 시청).
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
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
