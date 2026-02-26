import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// task_queue is not yet in generated types (migration pending) — cast via helper
const tq = (sb: any) => sb.from("task_queue");

/** Order: manual first, then priority DESC, then created_at ASC (FIFO) */
function sortQueueItems<T extends { source?: string | null; priority?: number | null; created_at?: string | null }>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => {
    const aManual = (a.source ?? "channel_auto") === "manual" ? 0 : 1;
    const bManual = (b.source ?? "channel_auto") === "manual" ? 0 : 1;
    if (aManual !== bManual) return aManual - bManual;
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    const ta = a.created_at ?? "";
    const tb = b.created_at ?? "";
    return ta.localeCompare(tb);
  });
}

/**
 * GET /api/queue
 * Query: status (default 'queued'), limit (default 50)
 * Items ordered: source manual first, then priority DESC, then created_at ASC.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "queued";
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);

    let query = tq(supabase).select("*").limit(Math.min(limit * 2, 500));

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    const sorted = sortQueueItems(data ?? []);
    const items = sorted.slice(0, limit);

    const { count: queuedCount } = await tq(supabase)
      .select("id", { count: "exact", head: true })
      .eq("status", "queued");

    const { count: runningCount } = await supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "running");

    return NextResponse.json({
      items,
      stats: {
        queued: queuedCount ?? 0,
        running: runningCount ?? 0,
      },
    });
  } catch (error) {
    console.error("Error fetching queue:", error);
    return NextResponse.json({ error: "Failed to fetch queue" }, { status: 500 });
  }
}

function getVideoIdFromConfig(taskConfig: Record<string, unknown>): string | null {
  const id = taskConfig.videoId ?? taskConfig.video_id;
  return typeof id === "string" ? id : null;
}

/**
 * POST /api/queue
 * Body: { task_config, priority?, source? }
 * source: 'manual' | 'channel_auto' (default from priority: >=6 -> manual, else channel_auto)
 * Conflict: same video already queued -> if channel_auto, upgrade to manual; if manual, 409.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    if (!body.task_config || typeof body.task_config !== "object") {
      return NextResponse.json({ error: "task_config (object) is required" }, { status: 400 });
    }

    const taskConfig = body.task_config as Record<string, unknown>;
    const priority = typeof body.priority === "number" ? body.priority : body.source === "manual" ? 8 : 5;
    const source = body.source === "manual" ? "manual" : "channel_auto";

    const videoId = getVideoIdFromConfig(taskConfig);

    if (source === "manual" && videoId) {
      const { data: queuedList } = await tq(supabase)
        .select("id, source, priority, task_config, created_at")
        .eq("status", "queued");

      const existing = (queuedList ?? []).find((row: any) => {
        const cfg = row?.task_config;
        if (!cfg || typeof cfg !== "object") return false;
        const vid = (cfg as Record<string, unknown>).videoId ?? (cfg as Record<string, unknown>).video_id;
        return vid === videoId;
      });

      if (existing) {
        const existingSource = (existing as { source?: string }).source ?? "channel_auto";
        if (existingSource === "manual") {
          return NextResponse.json(
            { error: "이미 직접 등록된 영상입니다.", code: "ALREADY_MANUAL" },
            { status: 409 }
          );
        }
        const { data: updated, error: updateErr } = await tq(supabase)
          .update({
            source: "manual",
            priority,
            task_config: taskConfig,
          })
          .eq("id", (existing as { id: string }).id)
          .eq("status", "queued")
          .select()
          .single();
        if (updateErr) throw updateErr;
        return NextResponse.json({
          item: updated,
          updated: true,
          message: "기존 자동 등록을 직접 등록으로 변경했습니다.",
        }, { status: 200 });
      }
    }

    const insertPayload: Record<string, unknown> = {
      task_config: taskConfig,
      priority,
      status: "queued",
    };
    try {
      const { data: probe } = await tq(supabase).select("source").limit(1).maybeSingle();
      if (probe && "source" in probe) insertPayload.source = source;
    } catch {
      // source column may not exist yet
    }

    const { data, error } = await tq(supabase)
      .insert(insertPayload)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating queue item:", error);
    return NextResponse.json({ error: "Failed to create queue item" }, { status: 500 });
  }
}

/**
 * DELETE /api/queue
 * Body: { ids: [] }
 * Bulk cancel (only queued items).
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "ids array is required" }, { status: 400 });
    }

    const { data, error } = await tq(supabase)
      .update({ status: "cancelled" })
      .in("id", ids)
      .eq("status", "queued")
      .select("id");

    if (error) throw error;

    return NextResponse.json({ cancelled: data?.length ?? 0, requested: ids.length });
  } catch (error) {
    console.error("Error cancelling queue items:", error);
    return NextResponse.json({ error: "Failed to cancel queue items" }, { status: 500 });
  }
}
