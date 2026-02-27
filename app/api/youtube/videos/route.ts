import { NextRequest, NextResponse } from "next/server";
import { fetchRecentVideos, fetchVideoById } from "@/lib/youtube";

export const dynamic = "force-dynamic";

// GET /api/youtube/videos?videoId=xxx — single video info
// GET /api/youtube/videos?channelId=UC...&hours=24 — recent videos from channel
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get("videoId");
    const channelId = searchParams.get("channelId");
    const hoursParam = searchParams.get("hours");

    if (videoId) {
      const video = await fetchVideoById(videoId);
      return NextResponse.json(video, { status: 200 });
    }

    if (!channelId) {
      return NextResponse.json(
        { error: "Missing required query parameter: channelId or videoId" },
        { status: 400 }
      );
    }

    let hours = 24;
    if (hoursParam) {
      const parsedHours = parseInt(hoursParam, 10);
      if (isNaN(parsedHours) || parsedHours <= 0) {
        return NextResponse.json(
          { error: "Invalid hours parameter. Must be a positive integer." },
          { status: 400 }
        );
      }
      hours = parsedHours;
    }

    const videos = await fetchRecentVideos(channelId, hours);

    return NextResponse.json(videos, { status: 200 });
  } catch (error) {
    console.error("Error fetching videos:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch videos" },
      { status: 500 }
    );
  }
}
