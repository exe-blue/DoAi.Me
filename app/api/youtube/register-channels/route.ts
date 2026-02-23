import { NextResponse } from "next/server";
import { resolveChannelHandle, fetchRecentVideos } from "@/lib/youtube";
import { upsertChannel, getAllChannels } from "@/lib/db/channels";
import { upsertVideo } from "@/lib/db/videos";
import { createServerClient } from "@/lib/supabase/server";
import type { ChannelRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Fetch latest N videos from a channel (no time filter)
 * Used for initial channel registration
 */
async function fetchLatestVideos(channelId: string, count: number = 3) {
  if (!API_KEY) throw new Error("YOUTUBE_API_KEY not set");

  // Step 1: Search for latest videos (no publishedAfter filter)
  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("channelId", channelId);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("order", "date");
  searchUrl.searchParams.set("maxResults", String(count));
  searchUrl.searchParams.set("key", API_KEY);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const err = await searchRes.text();
    throw new Error(`YouTube search API error: ${searchRes.status} ${err}`);
  }

  const searchData = await searchRes.json();
  if (!searchData.items?.length) return [];

  // Step 2: Get video details (duration)
  const videoIds = searchData.items.map((i: any) => i.id.videoId).join(",");
  const detailUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  detailUrl.searchParams.set("part", "contentDetails,statistics");
  detailUrl.searchParams.set("id", videoIds);
  detailUrl.searchParams.set("key", API_KEY);

  const detailRes = await fetch(detailUrl.toString());
  if (!detailRes.ok) {
    const err = await detailRes.text();
    throw new Error(`YouTube videos API error: ${detailRes.status} ${err}`);
  }

  const detailData = await detailRes.json();

  // Build duration + view count map
  const detailMap = new Map<string, { duration: string; durationSec: number; viewCount: number }>();
  for (const v of detailData.items || []) {
    const dur = parseDuration(v.contentDetails.duration);
    detailMap.set(v.id, {
      duration: dur.formatted,
      durationSec: dur.seconds,
      viewCount: parseInt(v.statistics?.viewCount || "0", 10),
    });
  }

  // Step 3: Combine
  return searchData.items.map((item: any) => {
    const detail = detailMap.get(item.id.videoId);
    return {
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      publishedAt: item.snippet.publishedAt,
      channelTitle: item.snippet.channelTitle,
      duration: detail?.duration || "0:00",
      durationSeconds: detail?.durationSec || 0,
      viewCount: detail?.viewCount || 0,
    };
  });
}

function parseDuration(iso: string) {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return { formatted: "0:00", seconds: 0 };

  const h = parseInt(match[1] || "0", 10);
  const m = parseInt(match[2] || "0", 10);
  const s = parseInt(match[3] || "0", 10);
  const seconds = h * 3600 + m * 60 + s;

  const formatted = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;

  return { formatted, seconds };
}

/**
 * POST /api/youtube/register-channels
 *
 * Body: { handles: string[], fetchLatest?: number }
 *
 * Registers channels and fetches their latest N videos.
 * If handles is empty, uses default seed handles.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const handles: string[] = body.handles || [
      "@SUPERANT_AN",
      "@gamdongstockTV",
      "@closingpricebetting_TV",
      "@realstock_lab",
      "@hanriver_trading",
    ];

    const fetchCount = body.fetchLatest || 3;

    const results: Array<{
      handle: string;
      channelName: string;
      channelId: string;
      videosAdded: number;
      videos: Array<{ title: string; videoId: string; duration: string }>;
      error?: string;
    }> = [];

    for (const handle of handles) {
      try {
        // 1. Resolve channel info from YouTube API
        const info = await resolveChannelHandle(handle);

        // 2. Upsert channel to DB
        const channel = await upsertChannel({
          youtube_channel_id: info.id,
          channel_name: info.title,
          channel_url: `https://www.youtube.com/${info.handle}`,
          thumbnail_url: info.thumbnail,
          subscriber_count: info.subscriberCount,
          video_count: info.videoCount,
          monitoring_enabled: true,
        });

        // 3. Fetch latest N videos (no time filter)
        const videos = await fetchLatestVideos(info.id, fetchCount);

        // 4. Upsert videos to DB as active
        const addedVideos: Array<{ title: string; videoId: string; duration: string }> = [];

        for (const video of videos) {
          // upsert + set status to active so VideoDispatcher picks it up
          const upserted = await upsertVideo({
            channel_id: channel.id,
            youtube_video_id: video.videoId,
            title: video.title,
            thumbnail_url: video.thumbnail,
            published_at: video.publishedAt,
            duration_seconds: video.durationSeconds,
            auto_detected: true,
          });

          // Set status to active
          await createServerClient().from("videos").update({ status: "active" }).eq("id", upserted.id);

          addedVideos.push({
            title: video.title,
            videoId: video.videoId,
            duration: video.duration,
          });
        }

        results.push({
          handle,
          channelName: info.title,
          channelId: info.id,
          videosAdded: addedVideos.length,
          videos: addedVideos,
        });

        console.log(
          `[Register] ${info.title} (${info.handle}): ${addedVideos.length} videos added`
        );
      } catch (err) {
        console.error(`[Register] Failed for ${handle}:`, err);
        results.push({
          handle,
          channelName: "",
          channelId: "",
          videosAdded: 0,
          videos: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const totalChannels = results.filter((r) => !r.error).length;
    const totalVideos = results.reduce((sum, r) => sum + r.videosAdded, 0);

    return NextResponse.json({
      ok: true,
      summary: {
        channelsRegistered: totalChannels,
        totalVideosAdded: totalVideos,
      },
      results,
    });
  } catch (error) {
    console.error("[Register] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Registration failed" },
      { status: 500 }
    );
  }
}