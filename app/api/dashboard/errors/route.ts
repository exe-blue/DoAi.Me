import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { okList, errFrom, parseListParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/errors?hours=24&q=&level=&page=&pageSize=
 * Aggregated by type; optional q (message/type filter), level, pagination.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parseListParams(searchParams);
    const hours = Math.min(168, Math.max(1, parseInt(searchParams.get("hours") || "24", 10) || 24));
    const level = searchParams.get("level") || undefined;
    const q = searchParams.get("q")?.trim() || undefined;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from("task_logs")
      .select("message, level, created_at")
      .in("level", ["error", "fatal"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500);

    if (level) {
      query = query.eq("level", level);
    }

    const { data } = await query;

    const typeMap: Record<string, { count: number; severity: string; lastOccurred: string }> = {};
    for (const row of data || []) {
      const type = classifyError(row.message || "");
      if (!typeMap[type]) {
        typeMap[type] = { count: 0, severity: row.level || "error", lastOccurred: row.created_at ?? "" };
      }
      typeMap[type].count++;
    }

    let errors = Object.entries(typeMap)
      .map(([type, info]) => ({ type, ...info }))
      .sort((a, b) => b.count - a.count);

    if (q) {
      const lower = q.toLowerCase();
      errors = errors.filter((e) => e.type.toLowerCase().includes(lower));
    }

    const total = errors.length;
    const from = (page - 1) * pageSize;
    const slice = errors.slice(from, from + pageSize);

    return okList(slice, { page, pageSize, total });
  } catch (e) {
    console.error("Error fetching errors:", e);
    return errFrom(e, "ERRORS_ERROR", 500);
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
