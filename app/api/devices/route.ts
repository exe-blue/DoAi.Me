import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { DeviceRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("worker_id");
    const status = searchParams.get("status");

    let query = supabase
      .from("devices")
      .select("*")
      .order("last_seen", { ascending: false });

    if (workerId) {
      query = query.eq("worker_id", workerId);
    }
    if (status) {
      query = query.eq("status", status);
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
