import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { WorkerRow, DeviceRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

    const { data: worker, error } = await supabase
      .from("workers")
      .select("*")
      .eq("id", id)
      .single()
      .returns<WorkerRow>();

    if (error) throw error;

    const { data: devices, error: devErr } = await supabase
      .from("devices")
      .select("*")
      .eq("worker_id", id)
      .order("last_seen", { ascending: false })
      .returns<DeviceRow[]>();

    if (devErr) throw devErr;

    return NextResponse.json({ worker, devices: devices ?? [] });
  } catch (error) {
    console.error("Error fetching worker:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch worker" },
      { status: 500 }
    );
  }
}
