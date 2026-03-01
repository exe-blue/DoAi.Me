import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = createSupabaseServerClient();

    // 1. Get original task
    const { data: originalTask, error: taskErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (taskErr || !originalTask) {
      return NextResponse.json(
        { error: "Task not found" },
        { status: 404 }
      );
    }

    // 2. Get failed devices
    let failedQuery = supabase
      .from("task_devices")
      .select("device_serial")
      .eq("task_id", id)
      .in("status", ["failed", "timeout"]);

    if (body.device_ids && body.device_ids.length > 0) {
      failedQuery = failedQuery.in("device_serial", body.device_ids);
    }

    const { data: failedDevices } = await failedQuery.returns<
      { device_serial: string }[]
    >();

    if (!failedDevices || failedDevices.length === 0) {
      return NextResponse.json(
        { error: "No failed devices to retry" },
        { status: 400 }
      );
    }

    // 3. Create new task with same config targeting failed devices only
    const targetSerials = failedDevices.map((d) => d.device_serial);
    const { data: newTask, error: insertErr } = await supabase
      .from("tasks")
      .insert({
        type: originalTask.type,
        task_type: originalTask.task_type,
        video_id: originalTask.video_id,
        channel_id: originalTask.channel_id,
        worker_id: originalTask.worker_id,
        payload: originalTask.payload,
        priority: originalTask.priority,
        device_count: targetSerials.length,
        target_devices: targetSerials,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json(
        { error: insertErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { task: newTask, retried_devices: targetSerials.length },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error retrying task:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to retry task",
      },
      { status: 500 }
    );
  }
}
