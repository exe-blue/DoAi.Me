import { NextResponse } from "next/server";
import { createServerClientWithCookies } from "@/lib/supabase/server";
import { invokeEdgeFunction } from "@/lib/edge-functions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const supabase = await createServerClientWithCookies();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const result = await invokeEdgeFunction("sync-channels");
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
}
