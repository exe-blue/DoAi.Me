import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();
    const { worker_id } = body;

    if (!worker_id) {
      return NextResponse.json(
        { error: "worker_id is required" },
        { status: 400 }
      );
    }

    // 1. Get all unassigned proxies for this worker
    const { data: unassignedProxies, error: proxiesError } = await supabase
      .from("proxies")
      .select("id")
      .eq("worker_id", worker_id)
      .is("device_id", null)
      .order("created_at", { ascending: true })
      .returns<Array<{ id: string }>>();

    if (proxiesError) throw proxiesError;

    if (!unassignedProxies || unassignedProxies.length === 0) {
      return NextResponse.json(
        { error: "No unassigned proxies available for this worker" },
        { status: 400 }
      );
    }

    // 2. Get all devices for this worker that don't have a proxy assigned
    const { data: unassignedDevices, error: devicesError } = await supabase
      .from("devices")
      .select("id")
      .eq("worker_id", worker_id)
      .is("proxy_id", null)
      .returns<Array<{ id: string }>>();

    if (devicesError) throw devicesError;

    if (!unassignedDevices || unassignedDevices.length === 0) {
      return NextResponse.json(
        { error: "No unassigned devices found for this worker" },
        { status: 400 }
      );
    }

    // 3. Pair them up and assign
    const pairsToAssign = Math.min(
      unassignedProxies.length,
      unassignedDevices.length
    );

    let assignedCount = 0;

    for (let i = 0; i < pairsToAssign; i++) {
      const proxy = unassignedProxies[i];
      const device = unassignedDevices[i];

      // Update proxy with device_id
      const { error: updateProxyError } = await supabase
        .from("proxies")
        .update({ device_id: device.id })
        .eq("id", proxy.id)
        .returns<{ id: string }>();

      if (updateProxyError) {
        console.error("Error updating proxy:", updateProxyError);
        continue;
      }

      // Update device with proxy_id
      const { error: updateDeviceError } = await supabase
        .from("devices")
        .update({ proxy_id: proxy.id })
        .eq("id", device.id)
        .returns<{ id: string }>();

      if (updateDeviceError) {
        console.error("Error updating device:", updateDeviceError);
        // Rollback proxy assignment
        await supabase
          .from("proxies")
          .update({ device_id: null })
          .eq("id", proxy.id)
          .returns<{ id: string }>();
        continue;
      }

      assignedCount++;
    }

    const remainingUnassignedDevices = unassignedDevices.length - assignedCount;

    return NextResponse.json({
      assigned: assignedCount,
      remaining_unassigned_devices: remainingUnassignedDevices,
    });
  } catch (error) {
    console.error("Error auto-assigning proxies:", error);
    return NextResponse.json(
      { error: "Failed to auto-assign proxies" },
      { status: 500 }
    );
  }
}
