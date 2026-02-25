import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createBatchTask } from "@/lib/pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const tq = (sb: ReturnType<typeof createServerClient>) => sb.from("task_queue");

function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * GET /api/cron/dispatch-queue
 * 1분마다 호출. task_queue에서 큐된 항목 1개를 꺼내 tasks 테이블에 생성하고,
 * 해당 큐 항목을 dispatched로 표시해 Agent가 재생할 수 있게 함.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { data: items } = await tq(supabase)
      .select("*")
      .eq("status", "queued")
      .limit(20);

    if (!items?.length) {
      return NextResponse.json({
        ok: true,
        dispatched: 0,
        message: "No queued items",
      });
    }

    // manual first, then priority DESC, then created_at ASC
    const sorted = [...items].sort((a: any, b: any) => {
      const aM = (a.source ?? "channel_auto") === "manual" ? 0 : 1;
      const bM = (b.source ?? "channel_auto") === "manual" ? 0 : 1;
      if (aM !== bM) return aM - bM;
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pa !== pb) return pb - pa;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });

    const item = sorted[0];
    const config = item.task_config || {};
    const contentMode = config.contentMode ?? "single";
    const videoId = config.videoId ?? config.video_id;
    const channelId = config.channelId ?? config.channel_id;

    if (!videoId || !channelId) {
      await tq(supabase)
        .update({ status: "cancelled" })
        .eq("id", item.id);
      return NextResponse.json({
        ok: true,
        dispatched: 0,
        error: "Invalid task_config: missing videoId or channelId",
      });
    }

    const task = await createBatchTask({
      contentMode: contentMode === "channel" ? "channel" : "single",
      videoId,
      channelId,
      deviceCount: config.deviceCount ?? 20,
      source: (item.source === "manual" ? "manual" : "channel_auto") as "manual" | "channel_auto",
      priority: typeof item.priority === "number" ? item.priority : 5,
      variables: config.variables,
    });

    await tq(supabase)
      .update({
        status: "dispatched",
        dispatched_at: new Date().toISOString(),
        dispatched_task_id: (task as { id: string }).id,
      })
      .eq("id", item.id);

    return NextResponse.json({
      ok: true,
      dispatched: 1,
      queue_id: item.id,
      task_id: (task as { id: string }).id,
      video_id: videoId,
    });
  } catch (error) {
    console.error("[Cron] Dispatch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Dispatch failed" },
      { status: 500 }
    );
  }
}
