import { NextResponse } from "next/server";
import { YOUTUBE_COMMANDER_ACTIONS } from "../commander-actions";

export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/actions
 * Returns all supported YouTube Commander actions (for docs and validation).
 */
export async function GET() {
  return NextResponse.json({ actions: YOUTUBE_COMMANDER_ACTIONS });
}
