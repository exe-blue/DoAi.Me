import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DeviceRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("worker_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("devices")
      .select("*")
      .order("last_seen", { ascending: false });

    if (workerId) {
      query = query.eq("pc_id", workerId);
    }
    if (status) {
      query = query.eq("status", status as any);
    }

    const { data, error } = await query.returns<DeviceRow[]>();

    if (error) throw error;

    return NextResponse.json({ devices: data ?? [] });
  } catch (error) {
    console.error("Error fetching devices:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch devices" },
      { status: 500 }
    );
  }
}
