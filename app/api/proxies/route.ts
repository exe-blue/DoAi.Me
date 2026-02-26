import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { ok, okList, err, errFrom, parseListParams } from "@/lib/api-utils";
import type { ProxyRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** Parse raw "IP:PORT:ID:PW" into { address, username, password }. */
function parseRawProxy(
  raw: string,
): { address: string; username: string; password: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length < 4) return null;
  const address = `${parts[0]}:${parts[1]}`;
  const username = parts[2];
  const password = parts.slice(3).join(":"); // password may contain ':'
  return { address, username, password };
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { searchParams } = new URL(request.url);
    const { page, pageSize, q } = parseListParams(searchParams);
    const status = searchParams.get("status") || undefined;
    const assignedParam = searchParams.get("assigned");
    const assigned =
      assignedParam === "true"
        ? true
        : assignedParam === "false"
          ? false
          : undefined;

    let query = supabase.from("proxies").select("*", { count: "exact" });

    if (status) query = query.eq("status", status);
    if (assigned === true) query = query.not("device_id", "is", null);
    if (assigned === false) query = query.is("device_id", null);
    if (q) query = query.ilike("address", `%${q}%`);

    query = query.order("created_at", { ascending: false });
    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);

    const { data, error, count } = await query.returns<ProxyRow[]>();

    if (error) throw error;

    const list = data ?? [];
    const deviceIds = [
      ...new Set(list.map((p) => p.device_id).filter(Boolean)),
    ] as string[];
    let serialByDeviceId: Record<string, string> = {};
    if (deviceIds.length > 0) {
      const { data: devices } = await supabase
        .from("devices")
        .select("id, serial")
        .in("id", deviceIds);
      serialByDeviceId = (devices ?? []).reduce(
        (acc, d) => ({ ...acc, [d.id]: d.serial ?? d.id }),
        {},
      );
    }

    const rows = list.map((p) => ({
      ...p,
      assigned_to: p.device_id
        ? (serialByDeviceId[p.device_id] ?? p.device_id)
        : null,
    }));

    return okList(rows, { page, pageSize, total: count ?? rows.length });
  } catch (e) {
    console.error("Error fetching proxies:", e);
    return errFrom(e, "PROXIES_ERROR", 500);
  }
}

/**
 * POST /api/proxies
 * Body: { raw: "IP:PORT:ID:PW" } (single or multiple lines) or { address, username?, password? }
 * - raw: parsed as address=IP:PORT, username=ID, password=PW; multiple lines = bulk insert
 * - address (+ optional username, password): single insert, status='active'
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json().catch(() => ({}));

    if (body.raw != null) {
      const lines = typeof body.raw === "string" ? body.raw.split(/\r?\n/) : [];
      const parsed = lines
        .map((line: string) => parseRawProxy(line))
        .filter(Boolean);
      if (parsed.length === 0) {
        return err(
          "BAD_REQUEST",
          "raw must contain at least one valid line IP:PORT:ID:PW",
          400,
        );
      }
      const inserts = parsed.map((p) => ({
        address: p!.address,
        username: p!.username,
        password: p!.password,
        status: "active",
        device_id: null,
      }));
      const { data, error } = await supabase
        .from("proxies")
        .insert(inserts as any)
        .select()
        .returns<ProxyRow[]>();
      if (error) throw error;
      return ok({ created: data?.length ?? 0, data: data ?? [] }, 201);
    }

    const { address, username, password } = body;
    if (!address || typeof address !== "string") {
      return err(
        "BAD_REQUEST",
        "address is required (or use raw: 'IP:PORT:ID:PW')",
        400,
      );
    }

    const { data, error } = await supabase
      .from("proxies")
      .insert({
        address: address.trim(),
        username: username != null ? String(username) : null,
        password: password != null ? String(password) : null,
        status: "active",
        device_id: null,
      } as any)
      .select()
      .single()
      .returns<ProxyRow>();

    if (error) throw error;
    return ok({ data: data as ProxyRow }, 201);
  } catch (e) {
    console.error("Error creating proxy:", e);
    return errFrom(e, "PROXY_CREATE_ERROR", 500);
  }
}

/**
 * DELETE /api/proxies
 * Body: { ids: string[] }
 * Bulk delete. Unassigns devices first, then deletes.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const body = await request.json().catch(() => ({}));
    const ids = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0) {
      return err("BAD_REQUEST", "ids (non-empty array) is required", 400);
    }

    const { data: assigned } = await supabase
      .from("proxies")
      .select("id, device_id")
      .in("id", ids)
      .not("device_id", "is", null);

    const deviceIds = (assigned ?? [])
      .map((p) => p.device_id)
      .filter((id): id is string => id != null);

    if (deviceIds.length > 0) {
      await supabase
        .from("devices")
        .update({ proxy_id: null } as any)
        .in("id", deviceIds);
      await supabase
        .from("proxies")
        .update({ device_id: null })
        .in(
          "id",
          (assigned ?? []).map((p) => p.id),
        );
    }

    const { error } = await supabase.from("proxies").delete().in("id", ids);
    if (error) throw error;

    return ok({ deleted: ids.length });
  } catch (e) {
    console.error("Error bulk deleting proxies:", e);
    return errFrom(e, "PROXIES_DELETE_ERROR", 500);
  }
}
