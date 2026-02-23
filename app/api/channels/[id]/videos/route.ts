import { NextResponse } from "next/server";
import {
  getVideosByChannelIdWithFilters,
  createVideo,
  bulkCreateVideos,
  bulkDeleteVideos,
} from "@/lib/db/videos";
import { mapVideoRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

// Helper to extract video id from YouTube URL
function extractYoutubeVideoId(url: string): string | null {
  if (!url) return null;

  // Match youtube.com/watch?v=VIDEO_ID
  const vMatch = url.match(/[?&]v=([^&]+)/);
  if (vMatch) return vMatch[1];

  // Match youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) return shortMatch[1];

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
    const { title, youtube_url, priority, status } = body;

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
      priority: priority ?? "normal",
      status: status ?? "active",
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
