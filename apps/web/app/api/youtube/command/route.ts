import { NextRequest, NextResponse } from "next/server";
import { createServerClientWithCookies } from "@/lib/supabase/server";
import { invokeEdgeFunction } from "@/lib/edge-functions";
import { isSupportedAction, YOUTUBE_COMMANDER_ACTIONS } from "../commander-actions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClientWithCookies();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    if (!body?.command?.action || typeof body.command.action !== "string") {
      return NextResponse.json({ error: "command.action (string) is required" }, { status: 400 });
    }
    if (!isSupportedAction(body.command.action)) {
      return NextResponse.json({ error: `Unknown action: ${body.command.action}`, available: Object.keys(YOUTUBE_COMMANDER_ACTIONS) }, { status: 400 });
    }

    const result = await invokeEdgeFunction("youtube-command", body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to create command task" }, { status: 500 });
  }
}
