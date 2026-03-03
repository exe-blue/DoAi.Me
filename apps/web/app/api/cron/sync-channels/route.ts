import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runSyncChannels } from "@/lib/sync-channels-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function verifySupabaseScheduleAuth(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const jwt = authHeader.replace("Bearer ", "").trim();
  if (!jwt) return false;

  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error) return false;
    return Boolean(data.user?.id);
  } catch {
    return false;
  }
}

/**
 * POST /api/cron/sync-channels
 * Supabase Scheduled Functions 또는 pg_cron + HTTP 호출에서 실행되는 내부 스케줄 엔드포인트.
 */
export async function POST(request: Request) {
  if (!(await verifySupabaseScheduleAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSyncChannels();
  if (!result.ok) {
    const err = "error" in result ? result.error : "Sync failed";
    return NextResponse.json({ error: err }, { status: 500 });
  }
  return NextResponse.json(result);
}
