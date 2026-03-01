import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();
    const { proxy_id, device_id } = body;

    if (!proxy_id) {
      return NextResponse.json(
        { error: "proxy_id is required" },
        { status: 400 }
      );
    }

    if (device_id !== null && typeof device_id !== "string") {
      return NextResponse.json(
        { error: "device_id must be a string or null" },
        { status: 400 }
      );
    }

    if (device_id) {
      // Assigning proxy to device
      // 1. Check the proxy exists and is not already assigned
      const { data: proxy, error: proxyError } = await supabase
        .from("proxies")
        .select("device_id")
        .eq("id", proxy_id)
        .single()
        .returns<{ device_id: string | null }>();

      if (proxyError) throw proxyError;

      if (proxy.device_id && proxy.device_id !== device_id) {
        return NextResponse.json(
          { error: "Proxy is already assigned to another device" },
          { status: 400 }
        );
      }

      // 2. Check the device doesn't already have a proxy
      const { data: device, error: deviceError } = await supabase
        .from("devices")
        .select("id, proxy_id")
        .eq("id", device_id)
        .single()
        .returns<{ id: string; proxy_id: string | null }>();

      if (deviceError) throw deviceError;

      if (device.proxy_id) {
        return NextResponse.json(
          { error: "Device already has a proxy assigned" },
          { status: 400 }
        );
      }

      // 3. Update proxy with device_id
      const { error: updateProxyError } = await supabase
        .from("proxies")
        .update({ device_id })
        .eq("id", proxy_id)
        .returns<{ id: string }>();

      if (updateProxyError) throw updateProxyError;

      // 4. Update device with proxy_id
      const { error: updateDeviceError } = await supabase
        .from("devices")
        .update({ proxy_id: proxy_id })
        .eq("id", device_id)
        .returns<{ id: string }>();

      if (updateDeviceError) {
        // Rollback: revert proxy assignment since device update failed
        console.error("Error updating device, rolling back proxy assignment:", updateDeviceError);
        const { error: rollbackError } = await supabase
          .from("proxies")
          .update({ device_id: null })
          .eq("id", proxy_id)
          .returns<{ id: string }>();

        if (rollbackError) {
          console.error("Error rolling back proxy assignment:", rollbackError);
        }

        throw updateDeviceError;
      }

      return NextResponse.json({ success: true });
    } else {
      // Unassigning proxy from device
      // 1. Get the proxy's current device_id
      const { data: proxy, error: proxyError } = await supabase
        .from("proxies")
        .select("device_id")
        .eq("id", proxy_id)
        .single()
        .returns<{ device_id: string | null }>();

      if (proxyError) throw proxyError;

      const oldDeviceId = proxy.device_id;

      // 2. Update proxy to remove device_id
      const { error: updateProxyError } = await supabase
        .from("proxies")
        .update({ device_id: null })
        .eq("id", proxy_id)
        .returns<{ id: string }>();

      if (updateProxyError) throw updateProxyError;

      // 3. If had a device, update device to remove proxy_id
      if (oldDeviceId) {
        const { error: updateDeviceError } = await supabase
          .from("devices")
          .update({ proxy_id: null })
          .eq("id", oldDeviceId)
          .returns<{ id: string }>();

        if (updateDeviceError) throw updateDeviceError;
      }

      return NextResponse.json({ success: true });
    }
  } catch (error) {
    console.error("Error assigning/unassigning proxy:", error);
    return NextResponse.json(
      { error: "Failed to assign/unassign proxy" },
      { status: 500 }
    );
  }
}
