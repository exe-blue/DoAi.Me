import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import type { DeviceRow } from "@/lib/supabase/types";
import { okList, errFrom, parseListParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const SORT_COLUMNS = new Set(["created_at", "last_seen", "serial", "status", "updated_at"]);

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
