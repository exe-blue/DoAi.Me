import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import type { DeviceRow } from "@/lib/supabase/types";
import { okList, errFrom, parseListParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const SORT_COLUMNS = new Set(["created_at", "last_seen", "serial", "status", "updated_at"]);

/**
 * POST /api/devices — 처음 등록: IP(connection_id) + 시리얼넘버 동시 입력.
 * Body: { serial_number: string, connection_id: string (e.g. "192.168.1.100:5555"), worker_id?: string }
 * 주기적으로 IP가 바뀌어도 heartbeat가 serial_number 기준으로 디바이스를 구별해 connection_id를 갱신함.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json().catch(() => ({}));
    const serial_number = typeof body.serial_number === "string" ? body.serial_number.trim() : null;
    const connection_id = typeof body.connection_id === "string" ? body.connection_id.trim() : null;
    const worker_id = typeof body.worker_id === "string" ? body.worker_id.trim() || null : null;

    if (!serial_number) {
      return errFrom(new Error("serial_number required"), "VALIDATION", 400);
    }
    if (!connection_id) {
      return errFrom(new Error("connection_id required (e.g. 192.168.1.100:5555)"), "VALIDATION", 400);
    }

    const insert: Record<string, unknown> = {
      serial_number,
      connection_id,
      serial: serial_number,
      status: "offline",
    };
    if (worker_id) insert.worker_id = worker_id;

    const { data, error } = await supabase.from("devices").insert(insert).select().single().returns<DeviceRow>();

    if (error) throw error;
    return Response.json(data, { status: 201 });
  } catch (e) {
    console.error("Error registering device:", e);
    return errFrom(e, "DEVICES_ERROR", 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { searchParams } = new URL(request.url);
    const { page, pageSize, sortBy, sortOrder, q } = parseListParams(searchParams);
    const status = searchParams.get("status") || undefined;
    const pc_id = searchParams.get("pc_id") || searchParams.get("worker_id") || undefined;

    let query = supabase.from("devices").select("*", { count: "exact" });

    if (status) query = query.eq("status", status);
    if (pc_id) query = query.eq("worker_id", pc_id);
    if (q) {
      query = query.or(`serial.ilike.%${q}%,connection_id.ilike.%${q}%,nickname.ilike.%${q}%`);
    }

    const orderBy = sortBy && SORT_COLUMNS.has(sortBy) ? sortBy : "last_seen";
    query = query.order(orderBy, { ascending: sortOrder === "asc" });

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query.returns<DeviceRow[]>();

    if (error) throw error;

    return okList(data ?? [], { page, pageSize, total: count ?? data?.length ?? 0 });
  } catch (e) {
    console.error("Error fetching devices:", e);
    return errFrom(e, "DEVICES_ERROR", 500);
  }
}
