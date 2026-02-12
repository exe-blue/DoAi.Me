import { NextRequest, NextResponse } from "next/server";
import { resolveChannelHandle, fetchRecentVideos } from "@/lib/youtube";
import { getAllChannels, upsertChannel } from "@/lib/db/channels";
import { getVideosWithChannelName, upsertVideo } from "@/lib/db/videos";
import { getTaskByVideoId } from "@/lib/db/tasks";
import { processNewVideos } from "@/lib/pipeline";
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
        youtube_channel_id: info.id,
        channel_name: info.title,
        channel_url: `https://www.youtube.com/${info.handle}`,
        thumbnail_url: info.thumbnail,
        subscriber_count: info.subscriberCount,
        video_count: info.videoCount,
        monitoring_enabled: true,
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
      : channels.filter((c) => c.monitoring_enabled);

    // Fetch and upsert videos for each channel
    const newVideoIds: string[] = [];
    let totalNewVideos = 0;

    await Promise.allSettled(
      channelsToSync.map(async (channel: ChannelRow) => {
        try {
          // Update channel info from YouTube API
          const info = await resolveChannelHandle(channel.channel_url);
          await upsertChannel({
            youtube_channel_id: channel.youtube_channel_id,
            channel_name: info.title,
            channel_url: channel.channel_url,
            thumbnail_url: info.thumbnail,
            subscriber_count: info.subscriberCount,
            video_count: info.videoCount,
          });

          // Fetch recent videos
          const videos = await fetchRecentVideos(channel.youtube_channel_id, 24);
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
              youtube_video_id: video.videoId,
              title: video.title,
              thumbnail_url: video.thumbnail,
              published_at: video.publishedAt,
              duration_seconds: durationSeconds,
              auto_detected: true,
            });

            // Check if this is a newly created video (created_at ~= updated_at)
            const createdMs = new Date(upserted.created_at).getTime();
            const updatedMs = new Date(upserted.updated_at).getTime();
            if (Math.abs(updatedMs - createdMs) < 5000) {
              newVideoIds.push(upserted.id);
              totalNewVideos++;
            }
          }
        } catch (err) {
          console.error(`Sync failed for channel ${channel.channel_name}:`, err);
        }
      })
    );

    // Run pipeline on new videos
    let autoCreatedTasks = 0;
    if (newVideoIds.length > 0) {
      const pipelineResult = await processNewVideos(newVideoIds);
      autoCreatedTasks = pipelineResult.createdTasks.length;
    }

    // Read final state from DB
    const finalChannels = await getAllChannels() as ChannelRow[];
    const finalVideos = await getVideosWithChannelName() as (VideoRow & { channels?: { channel_name: string } | null })[];

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
        autoCreatedTasks,
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
