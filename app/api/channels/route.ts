import { NextResponse } from "next/server";
import { getAllChannels, createChannel } from "@/lib/db/channels";
import { getVideosWithChannelName } from "@/lib/db/videos";
import { getTaskByVideoId } from "@/lib/db/tasks";
import { mapChannelRow, mapVideoRow } from "@/lib/mappers";
import { createServerClient } from "@/lib/supabase/server";
import { resolveChannelHandle } from "@/lib/youtube";
import type { ChannelRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fix N+1 query: get channels with video_count in a single query
    const supabase = createServerClient();
    const { data: channelsWithCount, error: channelsError } = await supabase
      .from("channels")
      .select("*, videos(count)")
      .order("created_at", { ascending: true })
      .returns<(ChannelRow & { videos: Array<{ count: number }> })[]>();

    if (channelsError) throw channelsError;

    const videos = await getVideosWithChannelName();

    const mappedChannels = channelsWithCount.map((ch) => ({
      ...mapChannelRow(ch),
      video_count: ch.videos?.[0]?.count ?? 0,
      last_collected_at: ch.last_collected_at ?? null,
      is_monitored: ch.is_monitored ?? false,
      handle: ch.handle ?? null,
      status: ch.status ?? null,
      auto_collect: ch.auto_collect ?? false,
    }));

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, youtube_channel_id, youtube_url, category } = body;

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    let id: string;
    let profile_url: string | null = null;
    if (youtube_channel_id) {
      id = youtube_channel_id;
      profile_url = youtube_url || null;
    } else if (youtube_url) {
      const info = await resolveChannelHandle(youtube_url);
      id = info.id;
      profile_url = youtube_url;
    } else {
      return NextResponse.json({ error: "youtube_channel_id or youtube_url is required" }, { status: 400 });
    }

    const channel = await createChannel({
      id,
      name,
      profile_url,
      category: category || null,
    });

    return NextResponse.json({ channel: mapChannelRow(channel) }, { status: 201 });
  } catch (error) {
    console.error("Error creating channel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create channel" },
      { status: 500 }
    );
  }
}
