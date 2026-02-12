import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { WorkerRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("workers")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<WorkerRow[]>();

    if (error) throw error;

    // Fetch device counts per worker
    const { data: devices, error: devErr } = await supabase
      .from("devices")
      .select("worker_id")
      .returns<{ worker_id: string | null }[]>();

    if (devErr) throw devErr;

    const countMap: Record<string, number> = {};
    for (const d of devices ?? []) {
      if (d.worker_id) {
        countMap[d.worker_id] = (countMap[d.worker_id] || 0) + 1;
      }
    }

    const workers = (data ?? []).map((w) => ({
      ...w,
      device_count: countMap[w.id] ?? w.device_count,
    }));

    return NextResponse.json({ workers });
  } catch (error) {
    console.error("Error fetching workers:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch workers" },
      { status: 500 }
    );
  }
}
