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

    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.duration_sec !== undefined) updates.duration_sec = body.duration_sec;

    const video = await updateVideo(videoId, updates);

    return NextResponse.json({ video: mapVideoRow(video, null) });
  } catch (error) {
    console.error("Error updating video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update video" },
      { status: 500 }
    );
  }
}
