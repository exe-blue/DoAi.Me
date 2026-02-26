import { NextResponse } from "next/server";
import { updateVideo } from "@/lib/db/videos";
import { mapVideoRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.duration_sec !== undefined) updates.duration_sec = body.duration_sec;
    if (body.target_views !== undefined) updates.target_views = body.target_views;
    if (body.prob_like !== undefined) updates.prob_like = body.prob_like;
    if (body.prob_comment !== undefined) updates.prob_comment = body.prob_comment;
    if (body.watch_duration_sec !== undefined) updates.watch_duration_sec = body.watch_duration_sec;
    if (body.watch_duration_min_pct !== undefined) updates.watch_duration_min_pct = body.watch_duration_min_pct;
    if (body.watch_duration_max_pct !== undefined) updates.watch_duration_max_pct = body.watch_duration_max_pct;
    if (body.prob_subscribe !== undefined) updates.prob_subscribe = body.prob_subscribe;

    const video = await updateVideo(videoId, updates as any);

    return NextResponse.json({ video: mapVideoRow(video, null) });
  } catch (error) {
    console.error("Error updating video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update video" },
      { status: 500 }
    );
  }
}
