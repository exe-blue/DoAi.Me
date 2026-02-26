import { NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import type { DeviceRow } from "@/lib/supabase/types";
import { ok, err, errFrom } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getServerClient();
    const { id } = await params;

    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("id", id)
      .single()
      .returns<DeviceRow>();

    if (error) {
      if (error.code === "PGRST116") {
        return err("NOT_FOUND", `Device not found: ${id}`, 404);
      }
      throw error;
    }

    return ok(data);
  } catch (e) {
    console.error("Error fetching device:", e);
    return errFrom(e, "DEVICE_ERROR", 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getServerClient();
    const { id } = await params;
    const body = await request.json();

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

    return ok(data);
  } catch (e) {
    console.error("Error updating device:", e);
    return errFrom(e, "DEVICE_UPDATE_ERROR", 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getServerClient();
    const { id } = await params;

    const { data: device, error } = await supabase
      .from("devices")
      .delete()
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!device) {
      return err("NOT_FOUND", `Device not found: ${id}`, 404);
    }

    return ok({ deleted: true });
  } catch (e) {
    console.error("Error deleting device:", e);
    return errFrom(e, "DEVICE_DELETE_ERROR", 500);
  }
}
