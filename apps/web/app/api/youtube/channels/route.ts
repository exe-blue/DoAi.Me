import { NextRequest, NextResponse } from "next/server";
import { resolveChannelHandle } from "@/lib/youtube";
import { upsertChannel, deleteChannel, updateChannelMonitoring } from "@/lib/db/channels";
import { mapChannelRow } from "@/lib/mappers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Invalid request body. Expected { url: string }" },
        { status: 400 }
      );
    }

    const handleMatch = url.match(/@([a-zA-Z0-9_-]+)/);
    if (!handleMatch) {
      return NextResponse.json(
        { error: "Invalid YouTube channel URL" },
        { status: 400 }
      );
    }

    const handle = `@${handleMatch[1]}`;
    const info = await resolveChannelHandle(handle);

    const row = await upsertChannel({
      id: info.id,
      name: info.title,
      profile_url: `https://www.youtube.com/${info.handle}`,
      thumbnail_url: info.thumbnail,
      subscriber_count: String(info.subscriberCount ?? 0),
      video_count: info.videoCount,
      is_monitored: true,
    });

    return NextResponse.json(mapChannelRow(row));
  } catch (error) {
    console.error("Error registering channel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register channel" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const handlesParam = searchParams.get("handles");

    if (!handlesParam) {
      return NextResponse.json(
        { error: "Missing required query parameter: handles" },
        { status: 400 }
      );
    }

    const handles = handlesParam.split(",").map((h) => h.trim()).filter(Boolean);
    const results = await Promise.all(
      handles.map((handle) =>
        resolveChannelHandle(handle).catch((err) => ({
          error: err instanceof Error ? err.message : "Failed",
          handle,
        }))
      )
    );

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error fetching channels:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch channels" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await deleteChannel(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting channel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete channel" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, is_monitored, collect_interval_hours } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const row = await updateChannelMonitoring(
      id,
      is_monitored ?? true,
      collect_interval_hours
    );

    return NextResponse.json(mapChannelRow(row));
  } catch (error) {
    console.error("Error updating channel:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update channel" },
      { status: 500 }
    );
  }
}
