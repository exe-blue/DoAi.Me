import { NextRequest, NextResponse } from "next/server";
import { resolveChannelHandle, fetchRecentVideos } from "@/lib/youtube";
import { getAllChannels, upsertChannel } from "@/lib/db/channels";
import { getVideosWithChannelName, upsertVideo } from "@/lib/db/videos";
import { getTaskByVideoId } from "@/lib/db/tasks";
import { mapChannelRow, mapVideoRow } from "@/lib/mappers";
import type { ChannelRow, VideoRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const SEED_HANDLES = [
  "@SUPERANT_AN",
  "@gamdongstockTV",
  "@closingpricebetting_TV",
  "@realstock_lab",
  "@hanriver_trading",
];

async function seedChannels() {
  const results = await Promise.allSettled(
    SEED_HANDLES.map((handle) => resolveChannelHandle(handle))
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      const info = result.value;
      await upsertChannel({
        id: info.id,
        name: info.title,
        profile_url: `https://www.youtube.com/${info.handle}`,
        thumbnail_url: info.thumbnail,
        subscriber_count: String(info.subscriberCount ?? 0),
        video_count: info.videoCount,
        is_monitored: true,
      });
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check if we need to seed
    let channels = await getAllChannels();
    if (channels.length === 0) {
      await seedChannels();
      channels = await getAllChannels();
    }

    // Optional: filter to single channel
    const { searchParams } = new URL(request.url);
    const filterChannelId = searchParams.get("channelId");
    const channelsToSync = filterChannelId
      ? channels.filter((c) => c.id === filterChannelId)
      : channels.filter((c) => c.is_monitored);

    // Fetch and upsert videos for each channel
    let totalNewVideos = 0;

    await Promise.allSettled(
      channelsToSync.map(async (channel: ChannelRow) => {
        try {
          // Update channel info from YouTube API (resolve by handle or profile URL)
          const handleOrUrl = channel.handle ?? channel.profile_url ?? "";
          const info = await resolveChannelHandle(handleOrUrl);
          await upsertChannel({
            id: channel.id,
            name: info.title,
            profile_url: channel.profile_url ?? `https://www.youtube.com/${info.handle}`,
            thumbnail_url: info.thumbnail,
            subscriber_count: String(info.subscriberCount ?? 0),
            video_count: info.videoCount,
          });

          // Fetch recent videos
          const videos = await fetchRecentVideos(channel.id, 24);
          for (const video of videos) {
            // Parse duration string back to seconds for DB storage
            const durationParts = video.duration.split(":").map(Number);
            let durationSeconds = 0;
            if (durationParts.length === 3) {
              durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2];
            } else if (durationParts.length === 2) {
              durationSeconds = durationParts[0] * 60 + durationParts[1];
            }

            const upserted = await upsertVideo({
              channel_id: channel.id,
              id: video.videoId,
              title: video.title,
              thumbnail_url: video.thumbnail,
              duration_sec: durationSeconds,
            });

            // Check if this is a newly created video (created_at ~= updated_at)
            const createdMs = new Date(upserted.created_at ?? "").getTime();
            const updatedMs = new Date(upserted.updated_at ?? "").getTime();
            if (Math.abs(updatedMs - createdMs) < 5000) {
              totalNewVideos++;
            }
          }
        } catch (err) {
          console.error(`Sync failed for channel ${channel.name}:`, err);
        }
      })
    );

    // Read final state from DB
    const finalChannels = await getAllChannels() as ChannelRow[];
    const finalVideos = await getVideosWithChannelName() as (VideoRow & { channels?: { name: string } | null })[];

    // Map to front-end types
    const mappedChannels = finalChannels.map(mapChannelRow);
    const mappedContents = await Promise.all(
      finalVideos.map(async (v) => {
        const taskId = await getTaskByVideoId(v.id);
        return mapVideoRow(v, taskId);
      })
    );

    return NextResponse.json({
      channels: mappedChannels,
      contents: mappedContents,
      syncMeta: {
        syncedAt: new Date().toISOString(),
        newVideoCount: totalNewVideos,
        channelsSynced: channelsToSync.length,
      },
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
