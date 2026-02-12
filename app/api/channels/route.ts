import { NextResponse } from "next/server";
import { getAllChannels } from "@/lib/db/channels";
import { getVideosWithChannelName } from "@/lib/db/videos";
import { getTaskByVideoId } from "@/lib/db/tasks";
import { mapChannelRow, mapVideoRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const channels = await getAllChannels();
    const videos = await getVideosWithChannelName();

    const mappedChannels = channels.map(mapChannelRow);
    const mappedContents = await Promise.all(
      videos.map(async (v) => {
        const taskId = await getTaskByVideoId(v.id);
        return mapVideoRow(v as any, taskId);
      })
    );

    return NextResponse.json({ channels: mappedChannels, contents: mappedContents });
  } catch (error) {
    console.error("Error reading channels:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read channels" },
      { status: 500 }
    );
  }
}
