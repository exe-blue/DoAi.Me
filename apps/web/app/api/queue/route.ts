import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import {
  buildConfigFromWorkflow,
  DEFAULT_WATCH_WORKFLOW_ID,
  DEFAULT_WATCH_WORKFLOW_VERSION,
} from "@/lib/workflow-snapshot";
import { okList, errFrom, parseListParams } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

const tq = (sb: ReturnType<typeof getServerClient>) => (sb as any).from("task_queue");

function hasSnapshotSteps(
  config: unknown,
): config is { snapshot: { steps: unknown[] } } {
  const c = config as Record<string, unknown> | null | undefined;
  const steps = c?.snapshot as { steps?: unknown[] } | undefined;
  return Array.isArray(steps?.steps) && steps.steps.length > 0;
}

/** Order: manual first, then priority DESC, then created_at ASC (FIFO) */
function sortQueueItems<
  T extends {
    source?: string | null;
    priority?: number | null;
    created_at?: string | null;
  },
>(items: T[]): T[] {
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
 * Query: status (queued|dispatched|cancelled|all), page, pageSize, sortBy, sortOrder, q
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parseListParams(searchParams);
    const status = searchParams.get("status") ?? "queued";

    let query = tq(supabase).select("*").limit(500);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: all, error } = await query;
    if (error) throw error;

    const sorted = sortQueueItems((all ?? []) as any[]);
    const total = sorted.length;
    const from = (page - 1) * pageSize;
    const items = sorted.slice(from, from + pageSize);

    return okList(items, { page, pageSize, total });
  } catch (e) {
    console.error("Error fetching queue:", e);
    return errFrom(e, "QUEUE_ERROR", 500);
  }
}

function getVideoIdFromConfig(
  taskConfig: Record<string, unknown>,
): string | null {
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
    const supabase = getServerClient();
    const body = await request.json();

    if (!body.task_config || typeof body.task_config !== "object") {
      return NextResponse.json(
        { error: "task_config (object) is required" },
        { status: 400 },
      );
    }

    let taskConfig = body.task_config as Record<string, unknown>;
    const priority =
      typeof body.priority === "number"
        ? body.priority
        : body.source === "manual"
          ? 8
          : 5;
    const source = body.source === "manual" ? "manual" : "channel_auto";

    if (!hasSnapshotSteps(taskConfig)) {
      const videoIdFromConfig = getVideoIdFromConfig(taskConfig);
      const channelId =
        (taskConfig.channelId as string) ??
        (taskConfig.channel_id as string) ??
        "";
      const inputs = (taskConfig.inputs as Record<string, unknown>) ?? {};
      const built = await buildConfigFromWorkflow(
        DEFAULT_WATCH_WORKFLOW_ID,
        DEFAULT_WATCH_WORKFLOW_VERSION,
        {
          videoId: (inputs.videoId as string) ?? videoIdFromConfig ?? "",
          channelId: (inputs.channelId as string) ?? channelId,
          keyword: (inputs.keyword as string) ?? videoIdFromConfig ?? "",
          video_url:
            (inputs.video_url as string) ??
            (videoIdFromConfig
              ? `https://www.youtube.com/watch?v=${videoIdFromConfig}`
              : undefined),
        },
      );
      taskConfig = { ...taskConfig, ...built } as Record<string, unknown>;
    }

    const videoId = getVideoIdFromConfig(taskConfig);

    if (source === "manual" && videoId) {
      const { data: queuedList } = await tq(supabase)
        .select("id, source, priority, task_config, created_at")
        .eq("status", "queued");

      const existing = (queuedList ?? []).find((row: any) => {
        const cfg = row?.task_config;
        if (!cfg || typeof cfg !== "object") return false;
        const vid =
          (cfg as Record<string, unknown>).videoId ??
          (cfg as Record<string, unknown>).video_id;
        return vid === videoId;
      });

      if (existing) {
        const existingSource =
          (existing as { source?: string }).source ?? "channel_auto";
        if (existingSource === "manual") {
          return NextResponse.json(
            { error: "이미 직접 등록된 영상입니다.", code: "ALREADY_MANUAL" },
            { status: 409 },
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
        return NextResponse.json(
          {
            item: updated,
            updated: true,
            message: "기존 자동 등록을 직접 등록으로 변경했습니다.",
          },
          { status: 200 },
        );
      }
    }

    const insertPayload: Record<string, unknown> = {
      task_config: taskConfig,
      priority,
      status: "queued",
    };
    try {
      const { data: probe } = await tq(supabase)
        .select("source")
        .limit(1)
        .maybeSingle();
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
    return NextResponse.json(
      { error: "Failed to create queue item" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/queue
 * Body: { ids: [] }
 * Bulk cancel (only queued items).
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getServerClient();
    const { ids } = await request.json();

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "ids array is required" },
        { status: 400 },
      );
    }

    const { data, error } = await tq(supabase)
      .update({ status: "cancelled" })
      .in("id", ids)
      .eq("status", "queued")
      .select("id");

    if (error) throw error;

    return NextResponse.json({
      cancelled: data?.length ?? 0,
      requested: ids.length,
    });
  } catch (error) {
    console.error("Error cancelling queue items:", error);
    return NextResponse.json(
      { error: "Failed to cancel queue items" },
      { status: 500 },
    );
  }
}
