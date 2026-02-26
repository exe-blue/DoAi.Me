import { NextRequest, NextResponse } from "next/server";
import { createServerClient, DashboardStatsView } from "@doai/supabase";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerClient();

    const { data, error } = await supabase
      .from("v_dashboard_stats")
      .select("*")
      .single()
      .returns<DashboardStatsView>();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
