import { NextRequest, NextResponse } from "next/server";
import { createServerClientWithCookies } from "@/lib/supabase/server";
import { invokeEdgeFunction } from "@/lib/edge-functions";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClientWithCookies();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const result = await invokeEdgeFunction("youtube-deploy", body);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Deploy failed" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const result = await invokeEdgeFunction("youtube-deploy");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
