/**
 * 공통 채널 동기화 로직: YouTube Data API로 최근 영상 조회 → videos upsert → auto_collect 채널의 active 영상 task_queue enqueue.
 * /api/cron/sync-channels 와 /api/sync-channels 에서 사용.
 * task_queue.task_config는 buildConfigFromWorkflow로 생성 (config.snapshot.steps 포함).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRecentVideos } from "@/lib/youtube";
import { getAllChannels } from "@/lib/db/channels";
import { upsertVideo, getVideosByChannelIdWithFilters } from "@/lib/db/videos";
import { getTaskByVideoId } from "@/lib/db/tasks";
import {
  buildConfigFromWorkflow,
  DEFAULT_WATCH_WORKFLOW_ID,
  DEFAULT_WATCH_WORKFLOW_VERSION,
} from "@/lib/workflow-snapshot";
import type { ChannelRow } from "@/lib/supabase/types";

// task_queue is used by legacy agent; may be missing from generated DB types
const tq = (sb: ReturnType<typeof createSupabaseServerClient>) =>
  (sb as any).from("task_queue");

/** Normalize title for stable sort (Phase 9: order_key). */
function orderKeyFromTitle(title: string): string {
  return (title ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

export type SyncChannelsResult = {
  ok: true;
  channels_synced: number;
  new_videos: number;
  updated_videos: number;
  enqueued: number;
  errors: number;
  elapsed_ms: number;
};

export async function runSyncChannels(): Promise<
  SyncChannelsResult | { ok: false; error: string }
> {
  const startTime = Date.now();

  try {
    const channels = await getAllChannels();
    const monitored = channels.filter((c: ChannelRow) => c.is_monitored);

    if (monitored.length === 0) {
      return {
        ok: true,
        channels_synced: 0,
        new_videos: 0,
        updated_videos: 0,
        enqueued: 0,
        errors: 0,
        elapsed_ms: Date.now() - startTime,
      };
    }

    // Phase 2.4: round-robin channel sync to reduce YouTube API quota per run
    const ROUND_ROBIN_N = 5;
    const runIndex = Math.floor(Date.now() / 60_000) % ROUND_ROBIN_N;
    const monitoredThisRun = monitored.filter((_, i) => i % ROUND_ROBIN_N === runIndex);

    let totalNew = 0;
    let totalUpdated = 0;
    let errors = 0;

    for (const channel of monitoredThisRun) {
      try {
        const videos = await fetchRecentVideos(channel.id, 2);

        const supabase = createSupabaseServerClient();

        for (const video of videos) {
          const parts = video.duration.split(":").map(Number);
          let durationSec = 0;
          if (parts.length === 3)
            durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];

          const { data: existingVideo } = await supabase
            .from("videos")
            .select("source")
            .eq("id", video.videoId)
            .maybeSingle();
          if (
            (existingVideo as { source?: string } | null)?.source === "manual"
          ) {
            continue;
          }
          const upserted = await upsertVideo({
            channel_id: channel.id,
            id: video.videoId,
            title: video.title,
            channel_name: channel.name || null,
            thumbnail_url: video.thumbnail,
            duration_sec: durationSec,
            source: "channel_auto",
          });

          const createdMs = new Date(upserted.created_at ?? "").getTime();
          const updatedMs = new Date(upserted.updated_at ?? "").getTime();
          const isNew = Math.abs(updatedMs - createdMs) < 5000;

          if (isNew) {
            totalNew++;
            if ((channel as any).auto_collect) {
              await supabase
                .from("videos")
                .update({
                  status: "active",
                  target_views: 100,
                  watch_duration_sec:
                    (channel as any).default_watch_duration_sec || 60,
                  prob_like: (channel as any).default_prob_like || 15,
                  prob_comment: (channel as any).default_prob_comment || 5,
                  search_keyword: video.title
                    .replace(/#\S+/g, "")
                    .trim()
                    .substring(0, 50),
                })
                .eq("id", video.videoId);
            }
          } else {
            totalUpdated++;
          }
        }
      } catch (err) {
        errors++;
        console.error(
          `[Sync] Failed for ${channel.name}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    let totalEnqueued = 0;
    const supabase = createSupabaseServerClient();

    // Phase 2.3: prevent overlapping sync runs
    const { data: lockAcquired } = await (supabase as any).rpc("try_sync_lock");
    if (!lockAcquired) {
      const elapsed = Date.now() - startTime;
      return {
        ok: true,
        channels_synced: monitored.length,
        new_videos: totalNew,
        updated_videos: totalUpdated,
        enqueued: 0,
        errors,
        elapsed_ms: elapsed,
      };
    }

    try {
      let queuedVideoIds: string[] = [];
      try {
        const { data: queuedItems } = await tq(supabase)
          .select("task_config, video_id")
          .eq("status", "queued");
        queuedVideoIds = (queuedItems ?? []).map(
          (r: { task_config?: { videoId?: string; video_id?: string }; video_id?: string }) =>
            (r.video_id ?? r.task_config?.videoId ?? r.task_config?.video_id) as string,
        ).filter(Boolean);
      } catch {
        /* ignore */
      }

      const discoveredRunId = crypto.randomUUID();

      for (const channel of monitored) {
        if (!(channel as any).auto_collect) continue;
        try {
          const activeVideos = await getVideosByChannelIdWithFilters(channel.id, {
            status: "active",
            sort_by: "created_at",
          });
          const sortedByOldestThenTitle = [...activeVideos].sort((a, b) => {
            const ta = new Date(a.created_at ?? 0).getTime();
            const tb = new Date(b.created_at ?? 0).getTime();
            if (ta !== tb) return ta - tb;
            const titleA = (a as { title?: string }).title ?? "";
            const titleB = (b as { title?: string }).title ?? "";
            return titleA.localeCompare(titleB, "ko");
          });
          for (const v of sortedByOldestThenTitle) {
            const hasTask = await getTaskByVideoId(v.id);
            if (hasTask) continue;
            if (queuedVideoIds.includes(v.id)) continue;
            const title = (v as { title?: string }).title ?? "";
            const keyword = (v as { search_keyword?: string }).search_keyword ?? title ?? v.id;
            const inputs = {
              videoId: v.id,
              channelId: channel.id,
              keyword,
              video_url: `https://www.youtube.com/watch?v=${v.id}`,
            };
            const workflowConfig = await buildConfigFromWorkflow(
              DEFAULT_WATCH_WORKFLOW_ID,
              DEFAULT_WATCH_WORKFLOW_VERSION,
              inputs,
            );
            const insertRow: Record<string, unknown> = {
              task_config: {
                ...workflowConfig,
                contentMode: "single",
                videoId: v.id,
                channelId: channel.id,
                channel: channel.id,
                video_url: `https://www.youtube.com/watch?v=${v.id}`,
                title,
                keyword,
              },
              priority: 5,
              status: "queued",
              video_id: v.id,
              discovered_run_id: discoveredRunId,
              order_key: orderKeyFromTitle(title),
            };
            try {
              const probe = await tq(supabase)
                .select("source")
                .limit(1)
                .maybeSingle();
              if (probe && "source" in probe) insertRow.source = "channel_auto";
            } catch {
              /* ignore */
            }
            const { error: eqErr } = await tq(supabase).insert(insertRow);
            if (!eqErr) {
              queuedVideoIds.push(v.id);
              totalEnqueued++;
            }
          }
        } catch (err) {
          console.error(`[Sync] Enqueue failed for ${channel.name}:`, err);
        }
      }

      await (supabase as any).rpc("release_sync_lock");
    } catch (_) {
      await (supabase as any).rpc("release_sync_lock").catch(() => {});
    }

    const elapsed = Date.now() - startTime;
    return {
      ok: true,
      channels_synced: monitoredThisRun.length,
      new_videos: totalNew,
      updated_videos: totalUpdated,
      enqueued: totalEnqueued,
      errors,
      elapsed_ms: elapsed,
    };
  } catch (error) {
    console.error("[Sync] Fatal error:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Sync failed",
    };
  }
}
