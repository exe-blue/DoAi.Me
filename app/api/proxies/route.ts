import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const workerId = searchParams.get("worker_id");

    let query = supabase.from("proxies").select("*");

    if (workerId) {
      query = query.eq("worker_id", workerId);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .returns<Array<{
        id: string;
        address: string;
        type: string;
        status: string;
        worker_id: string | null;
        device_id: string | null;
        assigned_count: number;
        created_at: string;
      }>>();

    if (error) throw error;

    return NextResponse.json({ proxies: data ?? [] });
  } catch (error) {
    console.error("Error fetching proxies:", error);
    return NextResponse.json(
      { error: "Failed to fetch proxies" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/proxies
 * Body: { ids: ["uuid", ...] }
 * Bulk delete. Unassigns devices first.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 }
      );
    }

    // Get proxies that are assigned to devices
    const { data: assigned } = await supabase
      .from("proxies")
      .select("id, device_id")
      .in("id", ids)
      .not("device_id", "is", null);

    // Unassign devices first
    if (assigned && assigned.length > 0) {
      const deviceIds = assigned.map((p) => p.device_id).filter((id): id is string => id !== null);
      if (deviceIds.length > 0) {
        await supabase
          .from("devices")
          .update({ proxy_id: null } as any)
          .in("id", deviceIds);
      }
      // Clear device_id on proxies before delete
      await supabase
        .from("proxies")
        .update({ device_id: null })
        .in("id", assigned.map((p) => p.id));
    }

    // Delete proxies
    const { error } = await supabase
      .from("proxies")
      .delete()
      .in("id", ids);

    if (error) throw error;

    return NextResponse.json({ deleted: ids.length });
  } catch (error) {
    console.error("Error bulk deleting proxies:", error);
    return NextResponse.json(
      { error: "Failed to delete proxies" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();
    const { address, type = "socks5", worker_id = null } = body;

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("proxies")
      .insert({
        address,
        type,
        status: "active",
        worker_id,
        device_id: null,
        assigned_count: 0,
      })
      .select()
      .single()
      .returns<{
        id: string;
        address: string;
        type: string;
        status: string;
        worker_id: string | null;
        device_id: string | null;
        assigned_count: number;
        created_at: string;
      }>();

    if (error) throw error;

    return NextResponse.json({ proxy: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating proxy:", error);
    return NextResponse.json(
      { error: "Failed to create proxy" },
      { status: 500 }
    );
  }
}
