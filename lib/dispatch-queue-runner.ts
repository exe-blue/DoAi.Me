/**
 * 대기열(task_queue) 1건을 tasks + task_devices로 디스패치.
 * Cron 및 세션 인증 POST에서 공통 사용.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createBatchTask } from "@/lib/pipeline";
import type { TaskVariables } from "@/lib/types";

function toNumberOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

const tq = (sb: ReturnType<typeof createSupabaseServerClient>) =>
  (
    sb as {
      from: (
        t: string,
      ) => ReturnType<ReturnType<typeof createSupabaseServerClient>["from"]>;
    }
  ).from("task_queue");

export type DispatchResult =
  | { ok: true; dispatched: 0; message: string; error?: string }
  | {
      ok: true;
      dispatched: 1;
      queue_id: string;
      task_id: string;
      video_id: string;
    }
  | { ok: false; error: string };

export async function runDispatchQueue(): Promise<DispatchResult> {
  const supabase = createSupabaseServerClient();
  const { data: items } = await tq(supabase)
    .select("*")
    .eq("status", "queued")
    .limit(20);

  if (!items?.length) {
    return { ok: true, dispatched: 0, message: "No queued items" };
  }

  const sorted = [...items].sort((a: any, b: any) => {
    const aM = (a.source ?? "channel_auto") === "manual" ? 0 : 1;
    const bM = (b.source ?? "channel_auto") === "manual" ? 0 : 1;
    if (aM !== bM) return aM - bM;
    const pa = a.priority ?? 0;
    const pb = b.priority ?? 0;
    if (pa !== pb) return pb - pa;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  const item = sorted[0] as {
    id: string;
    task_config?: Record<string, unknown>;
    source?: string;
    priority?: number;
    created_at?: string;
  };
  const config = (item.task_config || {}) as Record<string, unknown>;
  const inputs = (config.inputs as Record<string, unknown> | undefined) ?? {};
  const contentMode = (config.contentMode as string | undefined) ?? "single";
  const videoId =
    (config.videoId as string | undefined) ??
    (inputs.videoId as string | undefined) ??
    (config.video_id as string | undefined);
  const channelId =
    (config.channelId as string | undefined) ??
    (inputs.channelId as string | undefined) ??
    (config.channel_id as string | undefined);

  if (!videoId || !channelId) {
    await (
      tq(supabase) as unknown as {
        update: (v: object) => {
          eq: (col: string, val: string) => Promise<unknown>;
        };
      }
    )
      .update({ status: "cancelled" })
      .eq("id", item.id);
    return {
      ok: true,
      dispatched: 0,
      message: "Cancelled",
      error: "Invalid task_config: missing videoId or channelId",
    };
  }

  const task = await createBatchTask({
    contentMode: contentMode === "channel" ? "channel" : "single",
    videoId,
    channelId,
    deviceCount: toNumberOr((config as any)?.deviceCount, 20),
    source: (item.source === "manual" ? "manual" : "channel_auto") as
      | "manual"
      | "channel_auto",
    priority: typeof item.priority === "number" ? item.priority : 5,
    variables: config?.variables as TaskVariables | undefined,
  });

  await (
    tq(supabase) as unknown as {
      update: (v: object) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    }
  )
    .update({
      status: "dispatched",
      dispatched_at: new Date().toISOString(),
      dispatched_task_id: (task as { id: string }).id,
    })
    .eq("id", item.id);

  return {
    ok: true,
    dispatched: 1,
    queue_id: item.id,
    task_id: (task as { id: string }).id,
    video_id: videoId,
  };
}
