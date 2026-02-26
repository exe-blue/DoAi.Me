import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TaskDeviceRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createSupabaseServerClient();

    const { data, error } = await supabase
      .from("task_devices")
      .select("*")
      .eq("task_id", id)
      .order("device_serial", { ascending: true })
      .returns<TaskDeviceRow[]>();

    if (error) throw error;

    // Fetch device nicknames for display
    const serials = (data || []).map((d) => d.device_serial);
    const { data: devices } = await supabase
      .from("devices")
      .select("serial, nickname, model")
      .in("serial", serials)
      .returns<{ serial: string; nickname: string | null; model: string | null }[]>();

    const deviceMap = new Map(
      (devices || []).map((d) => [d.serial, d])
    );

    const enriched = (data || []).map((td) => ({
      ...td,
      device_name:
        deviceMap.get(td.device_serial)?.nickname ||
        deviceMap.get(td.device_serial)?.model ||
        td.device_serial,
    }));

    return NextResponse.json({ devices: enriched });
  } catch (error) {
    console.error("Error fetching task devices:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch task devices",
      },
      { status: 500 }
    );
  }
}
