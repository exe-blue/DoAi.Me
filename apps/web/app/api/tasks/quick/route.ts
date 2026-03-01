import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { quickTaskCreateSchema } from "@/lib/schemas";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/** Extract YouTube video ID from various URL formats */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      return u.pathname.slice(1).split("?")[0] || null;
    }
    const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
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
 * Body: { youtube_url: string, pc_id: string (UUID) }
 * Returns: { task, task_device }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const result = quickTaskCreateSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues }, { status: 400 });
    }

    const { youtube_url, pc_id } = result.data;

    const videoId = extractYouTubeId(youtube_url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Could not extract video ID from youtube_url" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseServerClient();

    // Find one online device for this PC
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("id, serial")
      .eq("pc_id", pc_id)
      .eq("status", "online")
      .limit(1)
      .returns<Array<{ id: string; serial: string }>>()
      .single();

    if (deviceError || !device) {
      // Fall back to any device if no online device found
      const { data: anyDevice, error: anyDeviceError } = await supabase
        .from("devices")
        .select("id, serial")
        .eq("pc_id", pc_id)
        .limit(1)
        .returns<Array<{ id: string; serial: string }>>()
        .single();

      if (anyDeviceError || !anyDevice) {
        return NextResponse.json(
          { error: "No devices found for the specified PC" },
          { status: 404 }
        );
      }

      return _createTask(supabase, anyDevice.id, pc_id, videoId, youtube_url);
    }

    return _createTask(supabase, device.id, pc_id, videoId, youtube_url);
  } catch (error) {
    console.error("[POST /api/tasks/quick]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create quick task" },
      { status: 500 }
    );
  }
}

async function _createTask(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  deviceId: string,
  pcId: string,
  videoId: string,
  youtubeUrl: string
) {
  // Create the parent task
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .insert({
      task_name: `quick_youtube_watch`,
      status: "pending",
      pc_id: pcId,
      payload: { video_url: youtubeUrl, video_id: videoId } as Json,
    } as never)
    .select("id")
    .single();

  if (taskError || !task) {
    return NextResponse.json(
      { error: taskError?.message ?? "Failed to create task" },
      { status: 500 }
    );
  }

  // Create one task_device row — the agent polls this to pick up work
  const { data: taskDevice, error: tdError } = await supabase
    .from("task_devices")
    .insert({
      task_id: (task as { id: string }).id,
      device_id: deviceId,
      pc_id: pcId,
      status: "pending",
      config: {
        video_url: youtubeUrl,
        video_id: videoId,
      } as Json,
    } as never)
    .select()
    .single();

  if (tdError || !taskDevice) {
    // Clean up orphaned task
    await supabase.from("tasks").delete().eq("id", (task as { id: string }).id);
    return NextResponse.json(
      { error: tdError?.message ?? "Failed to create task device" },
      { status: 500 }
    );
  }

  return NextResponse.json({ task, task_device: taskDevice }, { status: 201 });
}
