import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import type { DeviceRow } from "@/lib/supabase/types";
import { okList, errFrom, parseListParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const SORT_COLUMNS = new Set(["created_at", "last_seen", "serial", "status", "updated_at"]);

/**
 * POST /api/devices — 시리얼 중심 디바이스 등록.
 * Body: { serial: string, worker_id?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json().catch(() => ({}));
    const serial = typeof body.serial === "string" ? body.serial.trim() : null;
    const worker_id = typeof body.worker_id === "string" ? body.worker_id.trim() || null : null;

    if (!serial) {
      return errFrom(new Error("serial required"), "VALIDATION", 400);
    }

    const insert: Record<string, unknown> = {
      serial,
      status: "offline",
    };
    if (worker_id) insert.worker_id = worker_id;

    const { data, error } = await supabase.from("devices").insert(insert as any).select().single().returns<DeviceRow>();

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
    const worker_id = searchParams.get("worker_id") || undefined;

    let query = supabase.from("devices").select("*", { count: "exact" });

    if (status) query = query.eq("status", status as "error" | "online" | "offline" | "busy");
    if (worker_id) query = query.eq("worker_id", worker_id);
    if (q) {
      query = query.or(`serial.ilike.%${q}%,nickname.ilike.%${q}%`);
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
