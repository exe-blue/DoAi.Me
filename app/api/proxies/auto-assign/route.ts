import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/proxies/auto-assign
 * Body: { worker_id?: string, pc_id?: string }
 * - If worker_id or pc_id provided: assign unassigned proxies to unassigned devices for that PC only.
 * - If neither provided (global): assign unassigned proxies to unassigned devices across all PCs.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json().catch(() => ({}));
    const pcId = body.pc_id ?? body.worker_id ?? null;

    if (pcId) {
      // Per-PC mode: only this PC's proxies and devices
      const { data: unassignedProxies, error: proxiesError } = await supabase
        .from("proxies")
        .select("id")
        .eq("worker_id", pcId)
        .is("device_id", null)
        .order("created_at", { ascending: true })
        .returns<Array<{ id: string }>>();

      if (proxiesError) throw proxiesError;

      const { data: unassignedDevices, error: devicesError } = await supabase
        .from("devices")
        .select("id")
        .eq("pc_id", pcId)
        .is("proxy_id", null)
        .order("management_code", { ascending: true })
        .returns<Array<{ id: string }>>();

      if (devicesError) throw devicesError;

      if (!unassignedProxies?.length) {
        return NextResponse.json(
          { error: "No unassigned proxies available for this PC" },
          { status: 400 }
        );
      }
      if (!unassignedDevices?.length) {
        return NextResponse.json(
          { error: "No unassigned devices found for this PC" },
          { status: 400 }
        );
      }

      const assigned = await pairAndAssign(supabase, unassignedProxies, unassignedDevices);
      return NextResponse.json({
        assigned,
        remaining_unassigned_devices: unassignedDevices.length - assigned,
        mode: "pc",
      });
    }

    // Global mode: all unassigned proxies and all unassigned devices (any PC)
    const { data: unassignedProxies, error: proxiesError } = await supabase
      .from("proxies")
      .select("id")
      .is("device_id", null)
      .order("created_at", { ascending: true })
      .returns<Array<{ id: string }>>();

    if (proxiesError) throw proxiesError;

    const { data: unassignedDevices, error: devicesError } = await supabase
      .from("devices")
      .select("id")
      .is("proxy_id", null)
      .order("pc_id", { ascending: true })
      .order("management_code", { ascending: true })
      .returns<Array<{ id: string }>>();

    if (devicesError) throw devicesError;

    if (!unassignedProxies?.length) {
      return NextResponse.json(
        { error: "No unassigned proxies available" },
        { status: 400 }
      );
    }
    if (!unassignedDevices?.length) {
      return NextResponse.json(
        { error: "No unassigned devices found" },
        { status: 400 }
      );
    }

    const assigned = await pairAndAssign(supabase, unassignedProxies, unassignedDevices);
    return NextResponse.json({
      assigned,
      remaining_unassigned_devices: unassignedDevices.length - assigned,
      mode: "global",
    });
  } catch (error) {
    console.error("Error auto-assigning proxies:", error);
    return NextResponse.json(
      { error: "Failed to auto-assign proxies" },
      { status: 500 }
    );
  }
}

async function pairAndAssign(
  supabase: ReturnType<typeof createServerClient>,
  unassignedProxies: Array<{ id: string }>,
  unassignedDevices: Array<{ id: string }>
): Promise<number> {
  const pairsToAssign = Math.min(unassignedProxies.length, unassignedDevices.length);
  let assignedCount = 0;

  for (let i = 0; i < pairsToAssign; i++) {
    const proxy = unassignedProxies[i];
    const device = unassignedDevices[i];

    const { error: updateProxyError } = await supabase
      .from("proxies")
      .update({ device_id: device.id })
      .eq("id", proxy.id);

    if (updateProxyError) {
      console.error("Error updating proxy:", updateProxyError);
      continue;
    }

    const { error: updateDeviceError } = await supabase
      .from("devices")
      .update({ proxy_id: proxy.id })
      .eq("id", device.id);

    if (updateDeviceError) {
      console.error("Error updating device:", updateDeviceError);
      await supabase.from("proxies").update({ device_id: null }).eq("id", proxy.id);
      continue;
    }

    assignedCount++;
  }

  return assignedCount;
}
