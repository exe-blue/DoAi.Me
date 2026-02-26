import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ProxyInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/proxies/bulk
 * Bulk insert proxies from text list.
 * Accepts format: host:port:username:password (one per line)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();
    const {
      proxies: rawLines,
      type = "socks5" as const,
      worker_id = null,
    } = body as {
      proxies: string[];
      type?: "http" | "https" | "socks5";
      worker_id?: string | null;
    };

    if (!Array.isArray(rawLines) || rawLines.length === 0) {
      return NextResponse.json(
        { error: "proxies array is required" },
        { status: 400 }
      );
    }

    // Parse each line: host:port:username:password or host:port
    const invalidLines: string[] = [];
    const rows = rawLines
      .map((line: string) => line.trim())
      .filter(Boolean)
      .reduce<ProxyInsert[]>((acc, line, idx) => {
        const parts = line.split(":");
        const host = parts[0]?.trim();
        const port = parts[1]?.trim();

        if (
          !host ||
          !port ||
          parts.length < 2 ||
          !/^\d+$/.test(port)
        ) {
          invalidLines.push(`Line ${idx + 1}: "${line}"`);
          return acc;
        }

        const portNum = Number(port);
        if (portNum < 1 || portNum > 65535) {
          invalidLines.push(`Line ${idx + 1}: "${line}" (port out of range)`);
          return acc;
        }

        const username = parts[2] || null;
        const password = parts[3] || null;

        acc.push({
          address: `${host}:${port}`,
          username,
          password,
          type,
          status: "active" as const,
          worker_id,
          device_id: null,
          assigned_count: 0,
        } satisfies ProxyInsert);
        return acc;
      }, []);

    if (rows.length === 0) {
      return NextResponse.json(
        {
          error: "No valid proxy lines found",
          invalidLines,
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("proxies")
      .insert(rows)
      .select("id, address, username, type, status, worker_id")
      .returns<Array<{
        id: string;
        address: string;
        username: string | null;
        type: string;
        status: string;
        worker_id: string | null;
      }>>();

    if (error) throw error;

    return NextResponse.json(
      { inserted: data?.length ?? 0, proxies: data ?? [] },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error bulk inserting proxies:", error);
    return NextResponse.json(
      { error: "Failed to bulk insert proxies" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/proxies/bulk
 * Bulk update worker_id for unassigned proxies.
 * { worker_id: string, count?: number }
 * If count is omitted, all unassigned proxies are assigned.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const body = await request.json();
    const { worker_id, count } = body as {
      worker_id: string;
      count?: number;
    };

    if (!worker_id) {
      return NextResponse.json(
        { error: "worker_id is required" },
        { status: 400 }
      );
    }

    // Get unassigned proxies (worker_id IS NULL)
    let query = supabase
      .from("proxies")
      .select("id")
      .is("worker_id", null)
      .order("created_at", { ascending: true });

    if (count && count > 0) {
      query = query.limit(count);
    }

    const { data: proxies, error: fetchError } = await query
      .returns<Array<{ id: string }>>();

    if (fetchError) throw fetchError;

    if (!proxies || proxies.length === 0) {
      return NextResponse.json(
        { error: "No unassigned proxies available" },
        { status: 400 }
      );
    }

    const ids = proxies.map((p) => p.id);

    const { error: updateError } = await supabase
      .from("proxies")
      .update({ worker_id })
      .in("id", ids);

    if (updateError) throw updateError;

    return NextResponse.json({ updated: ids.length });
  } catch (error) {
    console.error("Error bulk assigning proxies:", error);
    return NextResponse.json(
      { error: "Failed to bulk assign proxies" },
      { status: 500 }
    );
  }
}
