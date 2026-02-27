import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { quickTaskCreateSchema } from "@/lib/schemas";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** Extract YouTube video ID from various URL formats */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    // youtu.be/VIDEO_ID
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("?")[0] || null;
    }
    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
    // youtube.com/watch?v=VIDEO_ID
    const v = u.searchParams.get("v");
    if (v) return v;
  } catch {
    // invalid URL
  }
  return null;
}

/**
 * POST /api/tasks/quick
 * Create a single-device YouTube watch task from a video URL.
 *
 * Body: { youtube_url: string, worker_id: string (UUID) }
 * Returns: { task, task_device }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = quickTaskCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues }, { status: 400 });
    }

    const { youtube_url, worker_id } = result.data;

    const videoId = extractYouTubeId(youtube_url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Could not extract video ID from youtube_url" },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Find one online device for this worker
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("serial")
      .eq("worker_id", worker_id)
      .eq("status", "online")
      .limit(1)
      .returns<Array<{ serial: string }>>()
      .single();

    if (deviceError || !device) {
      // Fall back to any device if no online device found
      const { data: anyDevice, error: anyDeviceError } = await supabase
        .from("devices")
        .select("serial")
        .eq("worker_id", worker_id)
        .limit(1)
        .returns<Array<{ serial: string }>>()
        .single();

      if (anyDeviceError || !anyDevice) {
        return NextResponse.json(
          { error: "No devices found for the specified worker" },
          { status: 404 }
        );
      }

      return _createTask(supabase, anyDevice.serial, worker_id, videoId, youtube_url);
    }

    return _createTask(supabase, device.serial, worker_id, videoId, youtube_url);
  } catch (error) {
    console.error("[POST /api/tasks/quick]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quick task" },
      { status: 500 }
    );
  }
}

async function _createTask(
  supabase: ReturnType<typeof createServerClient>,
  deviceSerial: string,
  workerId: string,
  videoId: string,
  youtubeUrl: string
) {
  // Create the parent task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      type: "youtube",
      task_type: "view_farm",
      title: `Quick: ${videoId}`,
      device_count: 1,
      status: "pending",
      worker_id: workerId,
      payload: {} as Json,
    })
    .select()
    .single();

  if (taskError || !task) {
    return NextResponse.json(
      { error: taskError?.message ?? "Failed to create task" },
      { status: 500 }
    );
  }

  // Create one task_device row
  const { data: taskDevice, error: tdError } = await supabase
    .from("task_devices")
    .insert({
      task_id: task.id,
      device_serial: deviceSerial,
      worker_id: workerId,
      status: "pending",
      config: {
        video_url: youtubeUrl,
        video_id: videoId,
      } as Json,
    })
    .select()
    .single();

  if (tdError || !taskDevice) {
    // Clean up orphaned task
    await supabase.from("tasks").delete().eq("id", task.id);
    return NextResponse.json(
      { error: tdError?.message ?? "Failed to create task device" },
      { status: 500 }
    );
  }

  return NextResponse.json({ task, task_device: taskDevice }, { status: 201 });
}
