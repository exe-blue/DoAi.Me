import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data: pcs, error: pcsErr } = await supabase
      .from("pcs")
      .select("id, pc_number, hostname, status, last_heartbeat, max_devices")
      .order("pc_number", { ascending: true });

    if (pcsErr) throw pcsErr;

    const { data: devices, error: devErr } = await supabase
      .from("devices")
      .select("pc_id, status");

    if (devErr) throw devErr;

    const countMap: Record<string, { total: number; online: number }> = {};
    for (const d of devices ?? []) {
      if (d.pc_id) {
        if (!countMap[d.pc_id]) countMap[d.pc_id] = { total: 0, online: 0 };
        countMap[d.pc_id].total++;
        if (d.status === "online" || d.status === "busy") {
          countMap[d.pc_id].online++;
        }
      }
    }

    const workers = (pcs ?? []).map((pc) => ({
      id: pc.id,
      pc_number: pc.pc_number,
      hostname: pc.hostname,
      status: pc.status ?? "offline",
      last_heartbeat: pc.last_heartbeat,
      device_count: countMap[pc.id]?.total ?? 0,
      online_count: countMap[pc.id]?.online ?? 0,
      max_devices: pc.max_devices ?? 20,
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
