import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createServerClient();
    const { id } = await params;
    const body = await request.json();

    const updateFields: {
      address?: string;
      type?: string;
      status?: string;
      worker_id?: string | null;
    } = {};

    if (body.address !== undefined) updateFields.address = body.address;
    if (body.type !== undefined) updateFields.type = body.type;
    if (body.status !== undefined) updateFields.status = body.status;
    if (body.worker_id !== undefined) updateFields.worker_id = body.worker_id;

    const { data, error } = await supabase
      .from("proxies")
      .update(updateFields as any)
      .eq("id", id)
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

    return NextResponse.json({ proxy: data });
  } catch (error) {
    console.error("Error updating proxy:", error);
    return NextResponse.json(
      { error: "Failed to update proxy" },
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

    // First, get the proxy to check if it has a device assigned
    const { data: proxy, error: fetchError } = await supabase
      .from("proxies")
      .select("device_id")
      .eq("id", id)
      .single()
      .returns<{ device_id: string | null }>();

    if (fetchError) throw fetchError;

    // If the proxy is assigned to a device, unassign it first
    if (proxy?.device_id) {
      const { error: updateError } = await supabase
        .from("devices")
        .update({ proxy_id: null })
        .eq("id", proxy.device_id)
        .returns<{ id: string }>();

      if (updateError) throw updateError;
    }

    // Delete the proxy
    const { error: deleteError } = await supabase
      .from("proxies")
      .delete()
      .eq("id", id)
      .returns<{ id: string }>();

    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting proxy:", error);
    return NextResponse.json(
      { error: "Failed to delete proxy" },
      { status: 500 }
    );
  }
}
