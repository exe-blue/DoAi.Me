import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/accounts
 * 계정 풀 건강도: status별 카운트
 */
export async function GET() {
  try {
    const supabase = createServerClient();

    const statuses = ["available", "in_use", "banned", "cooldown"] as const;
    const counts: Record<string, number> = {};

    for (const s of statuses) {
      const { count } = await supabase
        .from("accounts")
        .select("*", { count: "exact", head: true })
        .eq("status", s);
      counts[s] = count || 0;
    }

    const { count: total } = await supabase
      .from("accounts")
      .select("*", { count: "exact", head: true });

    return NextResponse.json({
      success: true,
      data: { total: total || 0, ...counts },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
