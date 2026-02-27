import { NextResponse } from "next/server";
import {
  getVideosByChannelIdWithFilters,
  createVideo,
  bulkCreateVideos,
  bulkDeleteVideos,
} from "@/lib/db/videos";
import { mapVideoRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

// Helper to extract video id from YouTube URL (watch, youtu.be, shorts)
function extractYoutubeVideoId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  const vMatch = trimmed.match(/[?&]v=([^&]+)/);
  if (vMatch) return vMatch[1];

  const shortMatch = trimmed.match(/youtu\.be\/([^/?]+)/);
  if (shortMatch) return shortMatch[1];

  const shortsMatch = trimmed.match(/youtube\.com\/shorts\/([^/?]+)/);
  if (shortsMatch) return shortsMatch[1];

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const sortBy = searchParams.get("sort_by") as "created_at" | "priority" | "priority_updated_at" | undefined;
    const statusParam = searchParams.get("status");

    const videos = await getVideosByChannelIdWithFilters(id, {
      sort_by: sortBy,
      status: statusParam ?? undefined,
    });

    return NextResponse.json({
      videos: videos.map((v) => ({
        ...mapVideoRow(v, null),
        priority: v.priority,
        completed_views: v.completed_views ?? 0,
        status: v.status,
      })),
    });
  } catch (error) {
    console.error("Error reading videos:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to read videos" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: channelId } = await params;
    const body = await request.json();

    // Bulk creation
    if (body.bulk && Array.isArray(body.bulk)) {
      const videosToCreate = body.bulk.map((item: any) => {
        const videoId = extractYoutubeVideoId(item.youtube_url || "");
        if (!videoId) {
          throw new Error(`Invalid youtube_url: ${item.youtube_url}`);
        }
        return {
          channel_id: channelId,
          id: videoId,
          title: item.title,
          priority: item.priority ?? "normal",
          status: item.status ?? "active",
        };
      });

      const videos = await bulkCreateVideos(videosToCreate);
      return NextResponse.json({
        videos: videos.map((v) => ({ ...mapVideoRow(v, null), priority: v.priority, completed_views: v.completed_views ?? 0, status: v.status })),
      }, { status: 201 });
    }

    // Single creation
    const {
      title,
      youtube_url,
      priority,
      status,
      channel_name,
      thumbnail_url,
      duration_sec,
      target_views,
      prob_like,
      prob_comment,
      watch_duration_sec,
      watch_duration_min_pct,
      watch_duration_max_pct,
      prob_subscribe,
      source,
    } = body;

    if (!title || !youtube_url) {
      return NextResponse.json(
        { error: "title and youtube_url are required" },
        { status: 400 }
      );
    }

    const videoId = extractYoutubeVideoId(youtube_url);
    if (!videoId) {
      return NextResponse.json(
        { error: "Invalid youtube_url format" },
        { status: 400 }
      );
    }

    const video = await createVideo({
      channel_id: channelId,
      id: videoId,
      title,
      channel_name: channel_name ?? null,
      thumbnail_url: thumbnail_url ?? null,
      duration_sec: duration_sec != null ? Number(duration_sec) : null,
      priority: priority ?? "normal",
      status: status ?? "active",
      source: source === "manual" || source === "channel_auto" ? source : null,
      target_views: target_views != null ? Number(target_views) : null,
      prob_like: prob_like != null ? Number(prob_like) : null,
      prob_comment: prob_comment != null ? Number(prob_comment) : null,
      watch_duration_sec: watch_duration_sec != null ? Number(watch_duration_sec) : null,
      watch_duration_min_pct: watch_duration_min_pct != null ? Number(watch_duration_min_pct) : null,
      watch_duration_max_pct: watch_duration_max_pct != null ? Number(watch_duration_max_pct) : null,
      prob_subscribe: prob_subscribe != null ? Number(prob_subscribe) : null,
    });

    return NextResponse.json({
      video: { ...mapVideoRow(video, null), priority: video.priority, completed_views: video.completed_views ?? 0, status: video.status },
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating video:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create video" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      return NextResponse.json(
        { error: "ids query parameter is required" },
        { status: 400 }
      );
    }

    const ids = idsParam.split(",");
    await bulkDeleteVideos(ids);

    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error) {
    console.error("Error deleting videos:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete videos" },
      { status: 500 }
    );
  }
}
