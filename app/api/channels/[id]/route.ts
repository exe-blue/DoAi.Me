import { NextResponse } from "next/server";
import { getChannelById, updateChannel, deleteChannel } from "@/lib/db/channels";
import { getVideosByChannelId } from "@/lib/db/videos";
import { mapChannelRow, mapVideoRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const channel = await getChannelById(id);
    const videos = await getVideosByChannelId(id);

    return NextResponse.json({
      channel: mapChannelRow(channel),
      videos: videos.map((v) => mapVideoRow(v, null)),
    });
  } catch (error) {
    console.error("Error reading channel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read channel" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updates: any = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.profile_url !== undefined) updates.profile_url = body.profile_url;
    if (body.youtube_url !== undefined) updates.profile_url = body.youtube_url;
    if (body.category !== undefined) updates.category = body.category;
    if (body.is_monitored !== undefined) updates.is_monitored = body.is_monitored;
    if (body.collect_interval_hours !== undefined)
      updates.collect_interval_hours = body.collect_interval_hours;

    const channel = await updateChannel(id, updates);

    return NextResponse.json({ channel: mapChannelRow(channel) });
  } catch (error) {
    console.error("Error updating channel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update channel" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteChannel(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting channel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete channel" },
      { status: 500 }
    );
  }
}
