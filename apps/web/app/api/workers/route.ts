import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();

    const { data: workersRows, error: workersErr } = await supabase
      .from("workers")
      .select("id, hostname, status, last_heartbeat, device_capacity")
      .order("hostname", { ascending: true });

    if (workersErr) throw workersErr;

    const { data: devices, error: devErr } = await supabase
      .from("devices")
      .select("worker_id, status");

    if (devErr) throw devErr;

    const countMap: Record<string, { total: number; online: number }> = {};
    for (const d of devices ?? []) {
      if (d.worker_id) {
        if (!countMap[d.worker_id]) countMap[d.worker_id] = { total: 0, online: 0 };
        countMap[d.worker_id].total++;
        if (d.status === "online" || d.status === "busy") {
          countMap[d.worker_id].online++;
        }
      }
    }

    const workers = (workersRows ?? []).map((w) => ({
      id: w.id,
      pc_number: w.hostname ?? w.id,
      hostname: w.hostname,
      status: w.status ?? "offline",
      last_heartbeat: w.last_heartbeat,
      device_count: countMap[w.id]?.total ?? 0,
      online_count: countMap[w.id]?.online ?? 0,
      max_devices: w.device_capacity ?? 20,
    }));

    return NextResponse.json({ workers });
  } catch (error) {
    console.error("Error fetching workers:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch workers" },
      { status: 500 },
    );
  }
}
