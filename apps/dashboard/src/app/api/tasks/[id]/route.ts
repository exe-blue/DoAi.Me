import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient, TaskRow, TaskDeviceRow } from "@doai/supabase";

export const dynamic = "force-dynamic";

const taskPatchSchema = z.object({
  status: z.enum(["pending", "assigned", "running", "done", "failed", "cancelled"]).optional(),
  error: z.string().optional(),
  result: z.record(z.unknown()).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // Query the task
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single()
      .returns<TaskRow>();

    if (taskError) {
      return NextResponse.json(
        { success: false, error: taskError.message },
        { status: 404 }
      );
    }

    // Query task device progress
    const { data: devices, error: devicesError } = await supabase
      .from("task_devices")
      .select("*")
      .eq("task_id", id)
      .order("created_at")
      .returns<TaskDeviceRow[]>();

    if (devicesError) {
      return NextResponse.json(
        { success: false, error: devicesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { task, devices: devices || [] },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = taskPatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.message },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const updates: Record<string, unknown> = { ...parsed.data };

    // Handle status-specific timestamps
    if (parsed.data.status) {
      const terminalStatuses = ["done", "failed", "cancelled"];
      if (terminalStatuses.includes(parsed.data.status)) {
        updates.completed_at = new Date().toISOString();
      } else if (parsed.data.status === "running") {
        updates.started_at = new Date().toISOString();
      }
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
      .returns<TaskRow>();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
