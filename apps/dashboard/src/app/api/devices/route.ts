import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type DeviceDetailView, type DeviceStatus } from "@doai/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const worker_id = searchParams.get("worker_id");
    const status = searchParams.get("status");
    const tag_group = searchParams.get("tag_group");

    let query = supabase
      .from("v_device_detail")
      .select("*")
      .order("last_seen", { ascending: false });

    if (worker_id) {
      query = query.eq("worker_id", worker_id);
    }
    if (status) {
      query = query.eq("status", status as DeviceStatus);
    }
    if (tag_group) {
      query = query.eq("tag_group", tag_group);
    }

    const { data, error } = await query.returns<DeviceDetailView[]>();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
