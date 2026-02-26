import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/proxies/{id}/swap
 * Body: { new_proxy_id: "uuid" }
 * Swap assignment: old proxy → unassigned, new proxy → assigned to same device.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id: oldProxyId } = await params;
    const { new_proxy_id: newProxyId } = await request.json();

    if (!newProxyId) {
      return NextResponse.json(
        { error: "new_proxy_id is required" },
        { status: 400 }
      );
    }

    // Get the old proxy to find which device it's assigned to
    const { data: oldProxy, error: oldErr } = await supabase
      .from("proxies")
      .select("id, device_id, address")
      .eq("id", oldProxyId)
      .single();

    if (oldErr) throw oldErr;

    if (!oldProxy?.device_id) {
      return NextResponse.json(
        { error: "Old proxy is not assigned to any device" },
        { status: 400 }
      );
    }

    const deviceId = oldProxy.device_id;

    // Verify new proxy exists and is not already assigned
    const { data: newProxy, error: newErr } = await supabase
      .from("proxies")
      .select("id, device_id, address")
      .eq("id", newProxyId)
      .single();

    if (newErr) throw newErr;

    if (newProxy?.device_id) {
      return NextResponse.json(
        { error: "New proxy is already assigned to another device" },
        { status: 400 }
      );
    }

    // Unassign old proxy
    const { error: unassignErr } = await supabase
      .from("proxies")
      .update({ device_id: null })
      .eq("id", oldProxyId);

    if (unassignErr) throw unassignErr;

    // Assign new proxy to the device
    const { error: assignErr } = await supabase
      .from("proxies")
      .update({ device_id: deviceId, fail_count: 0 })
      .eq("id", newProxyId);

    if (assignErr) throw assignErr;

    return NextResponse.json({
      swapped: true,
      device_id: deviceId,
      old_proxy: { id: oldProxyId, address: oldProxy.address },
      new_proxy: { id: newProxyId, address: newProxy.address },
    });
  } catch (error) {
    console.error("Error swapping proxy:", error);
    return NextResponse.json(
      { error: "Failed to swap proxy" },
      { status: 500 }
    );
  }
}
