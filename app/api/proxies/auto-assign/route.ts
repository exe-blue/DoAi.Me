import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { ok, err, errFrom } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

type ProxyRow = {
  id: string;
  address: string;
  username: string | null;
  password: string | null;
};
type DeviceRow = { id: string };

/**
 * POST /api/proxies/auto-assign
 * Body: { pc_id?: string (worker_id), limit?: number }
 * Pairs proxy_id-null devices with device_id-null proxies (1:1 by created_at), updates both,
 * and enqueues command_logs (command=set_proxy, results.proxy={ address, username, password }) per pair.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json().catch(() => ({}));
    const pcId = body.pc_id ?? body.worker_id ?? null;
    const limit = Math.min(100, Math.max(1, parseInt(body.limit, 10) || 100));

    let proxiesQuery = supabase
      .from("proxies")
      .select("id, address, username, password")
      .is("device_id", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (pcId) proxiesQuery = proxiesQuery.eq("worker_id", pcId);
    const { data: unassignedProxies, error: proxiesError } =
      await proxiesQuery.returns<ProxyRow[]>();

    if (proxiesError) throw proxiesError;

    let devicesQuery = supabase
      .from("devices")
      .select("id")
      .is("proxy_id", null)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (pcId) devicesQuery = devicesQuery.eq("worker_id", pcId);
    const { data: unassignedDevices, error: devicesError } =
      await devicesQuery.returns<DeviceRow[]>();

    if (devicesError) throw devicesError;

    const proxies = unassignedProxies ?? [];
    const devices = unassignedDevices ?? [];

    if (proxies.length === 0) {
      return err("BAD_REQUEST", "No unassigned proxies available", 400);
    }
    if (devices.length === 0) {
      return err("BAD_REQUEST", "No unassigned devices found", 400);
    }

    const result = await pairAssignAndEnqueue(supabase, proxies, devices);
    return ok({
      data: {
        assigned: result.assigned,
        deviceIds: result.deviceIds,
        proxyIds: result.proxyIds,
      },
    });
  } catch (e) {
    console.error("Error auto-assigning proxies:", e);
    return errFrom(e, "AUTO_ASSIGN_ERROR", 500);
  }
}

async function pairAssignAndEnqueue(
  supabase: ReturnType<typeof getServerClient>,
  proxyRows: ProxyRow[],
  deviceRows: DeviceRow[],
): Promise<{ assigned: number; deviceIds: string[]; proxyIds: string[] }> {
  const n = Math.min(proxyRows.length, deviceRows.length);
  const deviceIds: string[] = [];
  const proxyIds: string[] = [];

  for (let i = 0; i < n; i++) {
    const proxy = proxyRows[i];
    const device = deviceRows[i];

    const { error: upProxy } = await supabase
      .from("proxies")
      .update({ device_id: device.id })
      .eq("id", proxy.id);

    if (upProxy) {
      console.error("Error updating proxy", proxy.id, upProxy);
      continue;
    }

    const { error: upDevice } = await supabase
      .from("devices")
      .update({ proxy_id: proxy.id })
      .eq("id", device.id);

    if (upDevice) {
      console.error("Error updating device", device.id, upDevice);
      await supabase
        .from("proxies")
        .update({ device_id: null })
        .eq("id", proxy.id);
      continue;
    }

    const options = {
      proxy: {
        address: proxy.address,
        username: proxy.username ?? undefined,
        password: proxy.password ?? undefined,
      },
      apply_mode: "auto",
      scope: "all_connections",
    };

    const { error: logErr } = await supabase.from("command_logs").insert({
      command: "set_proxy",
      target_type: "devices",
      target_ids: [device.id],
      target_serials: null,
      status: "pending",
      initiated_by: "dashboard",
      results: options as any,
    } as any);

    if (logErr) {
      console.error("Error enqueueing set_proxy command", logErr);
    }

    deviceIds.push(device.id);
    proxyIds.push(proxy.id);
  }

  return { assigned: deviceIds.length, deviceIds, proxyIds };
}
