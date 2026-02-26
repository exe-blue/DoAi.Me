import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { DeviceRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("id", id)
      .single()
      .returns<DeviceRow>();

    if (error) throw error;

    return NextResponse.json({ device: data });
  } catch (error) {
    console.error("Error fetching device:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch device" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;
    const body = await request.json();

    // Only allow updating safe fields
    const allowedFields: (keyof DeviceRow)[] = [
      "nickname",
      "status",
      "proxy_id",
      "account_id",
      "connection_mode",
      "current_task_id",
    ];

    const updates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        updates[key] = body[key];
      }
    }

    const { data, error } = await supabase
      .from("devices")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single()
      .returns<DeviceRow>();

    if (error) throw error;

    return NextResponse.json({ device: data });
  } catch (error) {
    console.error("Error updating device:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update device" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;

    const { data: device, error } = await supabase
      .from("devices")
      .delete()
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!device) {
      return NextResponse.json(
        { error: `Device not found: ${id}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting device:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete device" },
      { status: 500 }
    );
  }
}
