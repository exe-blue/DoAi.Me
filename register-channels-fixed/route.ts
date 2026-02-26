import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Resolve YouTube handle to channel info
 */
async function resolveChannel(handle: string) {
  if (!API_KEY) throw new Error("YOUTUBE_API_KEY not set");

  // Clean handle
  let cleanHandle = handle.trim();
  if (cleanHandle.startsWith("http")) {
    const match = cleanHandle.match(/@[\w-]+/);
    if (!match) throw new Error(`Invalid YouTube URL: ${handle}`);
    cleanHandle = match[0];
  }
  if (!cleanHandle.startsWith("@")) cleanHandle = `@${cleanHandle}`;
  const forAPI = cleanHandle.slice(1); // remove @

  const url = new URL(`${YOUTUBE_API_BASE}/channels`);
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("forHandle", forAPI);
  url.searchParams.set("key", API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`YouTube channels API: ${res.status} ${err}`);
  }

  const data = await res.json();
  if (!data.items?.length) throw new Error(`Channel not found: ${cleanHandle}`);

  const ch = data.items[0];
  return {
    id: ch.id, // e.g. UCxxxxxxx
    name: ch.snippet.title,
    handle: cleanHandle,
    thumbnail: ch.snippet.thumbnails.high?.url || ch.snippet.thumbnails.default?.url,
    subscriberCount: ch.statistics.subscriberCount || "0",
    videoCount: parseInt(ch.statistics.videoCount || "0", 10),
  };
}

/**
 * Fetch latest N videos from a channel (no time filter)
 */
async function fetchLatestVideos(channelId: string, count: number = 3) {
  if (!API_KEY) throw new Error("YOUTUBE_API_KEY not set");

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
    throw new Error(`YouTube search API: ${searchRes.status} ${err}`);
  }

  const searchData = await searchRes.json();
  if (!searchData.items?.length) return [];

  // Get video details (duration)
  const videoIds = searchData.items.map((i: any) => i.id.videoId).join(",");
  const detailUrl = new URL(`${YOUTUBE_API_BASE}/videos`);
  detailUrl.searchParams.set("part", "contentDetails,statistics");
  detailUrl.searchParams.set("id", videoIds);
  detailUrl.searchParams.set("key", API_KEY);

  const detailRes = await fetch(detailUrl.toString());
  const detailData = detailRes.ok ? await detailRes.json() : { items: [] };

  const detailMap = new Map<string, { durationSec: number; viewCount: number }>();
  for (const v of detailData.items || []) {
    const match = v.contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = parseInt(match?.[1] || "0", 10);
    const m = parseInt(match?.[2] || "0", 10);
    const s = parseInt(match?.[3] || "0", 10);
    detailMap.set(v.id, {
      durationSec: h * 3600 + m * 60 + s,
      viewCount: parseInt(v.statistics?.viewCount || "0", 10),
    });
  }

  return searchData.items.map((item: any) => {
    const detail = detailMap.get(item.id.videoId);
    return {
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
      channelTitle: item.snippet.channelTitle,
      durationSec: detail?.durationSec || 0,
      viewCount: detail?.viewCount || 0,
    };
  });
}

/**
 * POST /api/youtube/register-channels
 * Body: { handles?: string[], fetchLatest?: number }
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
    const fetchCount = body.fetchLatest ?? 3;

    const supabase = createSupabaseServerClient();
    const results: any[] = [];

    for (const handle of handles) {
      try {
        // 1. Resolve channel from YouTube API
        const ch = await resolveChannel(handle);

        // 2. Upsert channel — ACTUAL DB columns
        // channels.id = YouTube channel ID (text PK)
        const { data: channel, error: chErr } = await supabase
          .from("channels")
          .upsert(
            {
              id: ch.id,              // YouTube channel ID as PK
              name: ch.name,
              handle: ch.handle,
              thumbnail_url: ch.thumbnail,
              subscriber_count: ch.subscriberCount,
              video_count: ch.videoCount,
              is_monitored: true,
              auto_collect: true,
              status: "active",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          )
          .select("id, name")
          .single();

        if (chErr) throw chErr;

        // 3. Fetch latest videos
        const videos = await fetchLatestVideos(ch.id, fetchCount);
        const addedVideos: any[] = [];

        for (const video of videos) {
          // 4. Upsert video — ACTUAL DB columns
          // videos.id = YouTube video ID (text PK)
          const { error: vErr } = await supabase
            .from("videos")
            .upsert(
              {
                id: video.videoId,          // YouTube video ID as PK
                title: video.title,
                channel_id: ch.id,          // FK to channels.id
                channel_name: ch.name,
                thumbnail_url: video.thumbnail,
                duration_sec: video.durationSec,
                video_duration_sec: video.durationSec,
                watch_duration_sec: Math.min(video.durationSec, 120), // max 2분
                watch_duration_min_pct: 30,
                watch_duration_max_pct: 90,
                target_views: 100,
                completed_views: 0,
                failed_views: 0,
                prob_like: 40,
                prob_comment: 0,
                prob_subscribe: 0,
                status: "active",
                priority: "normal",
                updated_at: new Date().toISOString(),
              },
              { onConflict: "id" }
            );

          if (vErr) {
            console.error(`[Register] Video upsert failed: ${vErr.message}`, video.videoId);
            continue;
          }

          addedVideos.push({
            videoId: video.videoId,
            title: video.title,
            durationSec: video.durationSec,
          });
        }

        results.push({
          handle,
          channelName: ch.name,
          channelId: ch.id,
          videosAdded: addedVideos.length,
          videos: addedVideos,
        });

        console.log(`[Register] ${ch.name} (${ch.handle}): ${addedVideos.length} videos`);
      } catch (err: any) {
        const errMsg = err?.message || (typeof err === "object" ? JSON.stringify(err) : String(err));
        console.error(`[Register] Failed for ${handle}:`, errMsg);
        results.push({
          handle,
          channelName: "",
          channelId: "",
          videosAdded: 0,
          videos: [],
          error: errMsg,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      summary: {
        channelsRegistered: results.filter((r) => !r.error).length,
        totalVideosAdded: results.reduce((s, r) => s + r.videosAdded, 0),
      },
      results,
    });
  } catch (error: any) {
    console.error("[Register] Fatal:", error);
    return NextResponse.json(
      { error: error?.message || String(error) },
      { status: 500 }
    );
  }
}