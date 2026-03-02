import { NextResponse } from "next/server";
import { createServerClientWithCookies } from "@/lib/supabase/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/sync-channels
 * 로그인된 사용자가 YouTube Data API 기반 동기화를 수동 실행.
 * 로컬에서 cron 대신 1분마다 이 API를 호출해 동기화할 수 있음.
 */
export async function POST() {
  try {
    const supabase = await createServerClientWithCookies();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await runSyncChannels();
    if (!result.ok) {
      return NextResponse.json({ error: (result as { ok: false; error: string }).error }, { status: 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Sync API]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
