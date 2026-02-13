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
