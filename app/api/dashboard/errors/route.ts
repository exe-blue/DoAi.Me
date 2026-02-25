import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/errors?hours=24
 * 최근 N시간 에러 요약: 유형별 카운트 + 심각도
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get("hours") || "24", 10);

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("execution_logs")
      .select("message, level, created_at")
      .eq("status", "failed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    // 유형별 집계
    const typeMap: Record<string, { count: number; severity: string; lastOccurred: string }> = {};
    for (const row of data || []) {
      const type = classifyError(row.message || "");
      if (!typeMap[type]) {
        typeMap[type] = { count: 0, severity: row.level || "error", lastOccurred: row.created_at };
      }
      typeMap[type].count++;
    }

    const errors = Object.entries(typeMap)
      .map(([type, info]) => ({ type, ...info }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      data: { hours, totalErrors: data?.length || 0, errors },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}

function classifyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("timeout")) return "timeout";
  if (m.includes("adb") || m.includes("xiaowei")) return "adb_connection";
  if (m.includes("proxy")) return "proxy";
  if (m.includes("account") || m.includes("banned")) return "account";
  if (m.includes("youtube") || m.includes("playback")) return "youtube";
  if (m.includes("bot") || m.includes("captcha")) return "bot_detection";
  return "other";
}
