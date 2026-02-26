import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PcRow = { id: string; last_heartbeat: string | null; status: string | null };

/**
 * GET /api/agents/[pcNumber]/health
 * Returns last heartbeat and device count for the given PC (e.g. PC00).
 * Used by PM2 health-check script or dashboard for server-side monitoring.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pcNumber: string }> }
) {
  try {
    const { pcNumber } = await params;
    const supabase = createSupabaseServerClient();

    const { data: pc, error } = await (supabase as any)
      .from("pcs")
      .select("id, last_heartbeat, status")
      .eq("pc_number", pcNumber)
      .maybeSingle() as { data: PcRow | null; error: unknown };

    if (error || !pc) {
      return NextResponse.json(
        { ok: false, error: "PC not found", pcNumber },
        { status: 404 }
      );
    }

    const lastHb = pc.last_heartbeat ? new Date(pc.last_heartbeat).getTime() : 0;
    const lastHeartbeatAgeSec = lastHb ? Math.round((Date.now() - lastHb) / 1000) : null;
    const stale = lastHeartbeatAgeSec !== null && lastHeartbeatAgeSec > 90;
    const ok = !stale && pc.status === "online";

    const { count } = await supabase
      .from("devices")
      .select("id", { count: "exact", head: true })
      .eq("pc_id", pc.id);

    return NextResponse.json({
      ok,
      pcNumber,
      lastHeartbeatAt: pc.last_heartbeat,
      lastHeartbeatAgeSec,
      status: pc.status,
      deviceCount: count ?? 0,
      alert: stale ? "stale" : ok ? "ok" : "offline",
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
