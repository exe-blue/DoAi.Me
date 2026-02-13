import { NextResponse } from "next/server";
import {
  getVideosByChannelIdWithFilters,
  createVideo,
  bulkCreateVideos,
  bulkDeleteVideos,
} from "@/lib/db/videos";
import { mapVideoRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

// Helper to extract youtube_video_id from URL
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

    const sortBy = searchParams.get("sort_by") as "published_at" | "priority" | "play_count" | undefined;
    const isActiveParam = searchParams.get("is_active");
    const isActive = isActiveParam !== null ? isActiveParam === "true" : undefined;

    const videos = await getVideosByChannelIdWithFilters(id, {
      sort_by: sortBy,
      is_active: isActive,
    });

    return NextResponse.json({
      videos: videos.map((v) => mapVideoRow(v, null)),
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
        const youtubeVideoId = extractYoutubeVideoId(item.youtube_url || "");
        if (!youtubeVideoId) {
          throw new Error(`Invalid youtube_url: ${item.youtube_url}`);
        }
        return {
          channel_id: channelId,
          youtube_video_id: youtubeVideoId,
          title: item.title,
          youtube_url: item.youtube_url || null,
          priority: item.priority || null,
          is_active: item.is_active !== undefined ? item.is_active : true,
        };
      });

      const videos = await bulkCreateVideos(videosToCreate);
      return NextResponse.json({
        videos: videos.map((v) => mapVideoRow(v, null)),
      }, { status: 201 });
    }

    // Single creation
    const { title, youtube_url, priority, is_active } = body;

    if (!title || !youtube_url) {
      return NextResponse.json(
        { error: "title and youtube_url are required" },
        { status: 400 }
      );
    }

    const youtubeVideoId = extractYoutubeVideoId(youtube_url);
    if (!youtubeVideoId) {
      return NextResponse.json(
        { error: "Invalid youtube_url format" },
        { status: 400 }
      );
    }

    const video = await createVideo({
      channel_id: channelId,
      youtube_video_id: youtubeVideoId,
      title,
      youtube_url,
      priority: priority || null,
      is_active: is_active !== undefined ? is_active : true,
    });

    return NextResponse.json({ video: mapVideoRow(video, null) }, { status: 201 });
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
