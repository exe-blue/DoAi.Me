import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { quickTaskCreateSchema } from "@/lib/schemas";
import type { Json } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shortsMatch) return shortsMatch[1];
    return u.searchParams.get("v");
  } catch {
    return null;
  }
}

/**
 * POST /api/tasks/quick
 * Body: { youtube_url: string, worker_id: string (UUID) }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = quickTaskCreateSchema.safeParse(body);
    if (!result.success) return NextResponse.json({ error: result.error.issues }, { status: 400 });

    const { youtube_url, worker_id } = result.data;
    const videoId = extractYouTubeId(youtube_url);
    if (!videoId) return NextResponse.json({ error: "Could not extract video ID from youtube_url" }, { status: 400 });

    const supabase = createSupabaseServerClient();
    const { data: device, error: deviceError } = await supabase
      .from("devices")
      .select("serial")
      .eq("worker_id", worker_id)
      .in("status", ["online", "busy"])
      .limit(1)
      .single();

    if (deviceError || !device) {
      return NextResponse.json({ error: "No devices found for the specified worker" }, { status: 404 });
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert({
        type: "youtube",
        task_type: "quick_youtube_watch",
        title: "quick_youtube_watch",
        status: "pending",
        worker_id,
        payload: { video_url: youtube_url, video_id: videoId } as Json,
      })
      .select("id")
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: taskError?.message ?? "Failed to create task" }, { status: 500 });
    }

    const { data: taskDevice, error: tdError } = await supabase
      .from("task_devices")
      .insert({
        task_id: task.id,
        device_serial: device.serial,
        worker_id,
        status: "pending",
        config: { video_url: youtube_url, video_id: videoId } as Json,
      })
      .select()
      .single();

    if (tdError || !taskDevice) {
      await supabase.from("tasks").delete().eq("id", task.id);
      return NextResponse.json({ error: tdError?.message ?? "Failed to create task device" }, { status: 500 });
    }

    return NextResponse.json({ task, task_device: taskDevice }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/tasks/quick]", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create quick task" }, { status: 500 });
  }
}
