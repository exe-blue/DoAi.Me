import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { ok, err, errFrom } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function PUT(
  request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getServerClient();
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

    return ok({ data });
  } catch (e) {
    console.error("Error updating proxy:", e);
    return errFrom(e, "PROXY_UPDATE_ERROR", 500);
  }
}

/** DELETE /api/proxies/[id]. Assigned proxies cannot be deleted (unassign first). */
export async function DELETE(
  request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getServerClient();
    const { id } = await params;

    const { data: proxy, error: fetchError } = await supabase
      .from("proxies")
      .select("device_id")
      .eq("id", id)
      .single()
      .returns<{ device_id: string | null }>();

    if (fetchError) throw fetchError;
    if (!proxy) return err("NOT_FOUND", "Proxy not found", 404);
    if (proxy.device_id) {
      return err(
        "BAD_REQUEST",
        "Cannot delete assigned proxy; unassign the device first",
        400,
      );
    }

    const { error: deleteError } = await supabase
      .from("proxies")
      .delete()
      .eq("id", id);
    if (deleteError) throw deleteError;

    return ok({ deleted: id });
  } catch (e) {
    console.error("Error deleting proxy:", e);
    return errFrom(e, "PROXY_DELETE_ERROR", 500);
  }
}
