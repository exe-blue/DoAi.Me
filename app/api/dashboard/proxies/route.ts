import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/proxies
 * 프록시 풀 건강도: status별 카운트
 */
export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { count: total } = await supabase
      .from("proxies")
      .select("*", { count: "exact", head: true });

    const { count: active } = await supabase
      .from("proxies")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    const { count: invalid } = await supabase
      .from("proxies")
      .select("*", { count: "exact", head: true })
      .in("status", ["inactive", "banned"]);

    const { count: unassigned } = await supabase
      .from("proxies")
      .select("*", { count: "exact", head: true })
      .is("device_serial", null);

    return NextResponse.json({
      success: true,
      data: {
        total: total || 0,
        active: active || 0,
        invalid: invalid || 0,
        unassigned: unassigned || 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: (err as Error).message }, { status: 500 });
  }
}
