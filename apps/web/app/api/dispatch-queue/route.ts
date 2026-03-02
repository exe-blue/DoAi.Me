import { NextResponse } from "next/server";
import { createServerClientWithCookies } from "@/lib/supabase/server";
import { runDispatchQueue } from "@/lib/dispatch-queue-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/dispatch-queue
 * 로그인된 사용자가 "지금 1건 디스패치" 실행.
 * 대기열에 영상이 있으면 PC01 등 각 PC에 task_devices가 생성되고,
 * 해당 PC Agent가 영상 시청 태스크를 가져가서 기기에서 재생함.
 */
export async function POST() {
  try {
    const supabase = await createServerClientWithCookies();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await runDispatchQueue();
    if (!result.ok) {
      return NextResponse.json({ error: (result as { ok: false; error: string }).error }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Dispatch API]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dispatch failed" },
      { status: 500 }
    );
  }
}
