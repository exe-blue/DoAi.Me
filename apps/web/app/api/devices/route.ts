import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import type { DeviceRow, DeviceInsert } from "@/lib/supabase/types";
import { okList, errFrom, parseListParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const SORT_COLUMNS = new Set(["created_at", "last_seen", "serial", "status", "updated_at"]);

const DEVICE_STATUSES = ["online", "offline", "busy", "error"] as const;
type DeviceStatus = (typeof DEVICE_STATUSES)[number];

/** UUID v4-ish: 8-4-4-4-12 hex. Reject invalid to avoid PostgREST filter injection. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PostgREST filter–reserved / unsafe: remove so .or(ilike,...) is not injectable */
const SEARCH_UNSAFE_PATTERN = /[`.:()'"\\]/g;
const SEARCH_MAX_LENGTH = 200;

function isDeviceStatus(s: string | null): s is DeviceStatus {
  return s != null && (DEVICE_STATUSES as readonly string[]).includes(s);
}

function isSafeUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/** Sanitize search term for .or(ilike): remove reserved chars (backtick, dot, colon, parens, quotes, backslash) to avoid filter injection. */
function sanitizeSearchTerm(q: string): string {
  return q.replaceAll(SEARCH_UNSAFE_PATTERN, "").slice(0, SEARCH_MAX_LENGTH).trim();
}

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

    const insert: DeviceInsert = {
      serial: serial_number,
      status: "offline",
      ip_intranet: connection_id,
      ...(worker_id && { worker_id }),
    };

    const { data, error } = await supabase.from("devices").insert(insert).select().single();

    if (error) throw error;
    return Response.json(data as DeviceRow, { status: 201 });
  } catch (e) {
    console.error("Error registering device:", e);
    return errFrom(e, "DEVICES_ERROR", 500);
  }
}

/**
 * GET /api/devices — list with optional filters.
 * pc_id/worker_id and search term q are validated/sanitized to avoid PostgREST filter injection.
 * Ensure row-level security (RLS) is enabled on the devices table so DB-level access is enforced.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { searchParams } = new URL(request.url);
    const { page, pageSize, sortBy, sortOrder, q } = parseListParams(searchParams);
    const statusParam = searchParams.get("status");
    const status = isDeviceStatus(statusParam) ? statusParam : undefined;
    const pc_id = searchParams.get("pc_id") || searchParams.get("worker_id") || undefined;

    let query = supabase.from("devices").select("*", { count: "exact" });

    if (status) query = query.eq("status", status);
    // Only apply pc_id filter when valid UUID to avoid PostgREST filter injection
    if (pc_id && isSafeUuid(pc_id)) {
      query = query.or(`pc_id.eq.${pc_id},worker_id.eq.${pc_id}`);
    }
    const safeQ = q ? sanitizeSearchTerm(q) : "";
    if (safeQ) {
      query = query.or(`serial.ilike.%${safeQ}%,connection_id.ilike.%${safeQ}%,nickname.ilike.%${safeQ}%`);
    }

    const orderBy = sortBy && SORT_COLUMNS.has(sortBy) ? sortBy : "last_seen";
    query = query.order(orderBy, { ascending: sortOrder === "asc" });

    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const list = (data ?? []) as DeviceRow[];
    return okList(list, { page, pageSize, total: count ?? list.length });
  } catch (e) {
    console.error("Error fetching devices:", e);
    return errFrom(e, "DEVICES_ERROR", 500);
  }
}
