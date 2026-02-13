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
    if (body.name !== undefined) updates.channel_name = body.name;
    if (body.youtube_channel_id !== undefined) updates.youtube_channel_id = body.youtube_channel_id;
    if (body.youtube_url !== undefined) updates.channel_url = body.youtube_url;
    if (body.category !== undefined) updates.category = body.category;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.monitoring_enabled !== undefined) updates.monitoring_enabled = body.monitoring_enabled;
    if (body.monitoring_interval_minutes !== undefined)
      updates.monitoring_interval_minutes = body.monitoring_interval_minutes;

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
