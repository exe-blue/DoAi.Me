/**
 * One-time seed: register 5 channels, fetch 2 latest videos per channel, set active, enqueue up to 10 to task_queue.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveChannelHandle } from "@/lib/youtube";
import { fetchRecentVideos } from "@/lib/youtube";
import { getAllChannels, upsertChannel } from "@/lib/db/channels";
import { upsertVideo, getVideosByChannelIdWithFilters } from "@/lib/db/videos";
import { getTaskByVideoId } from "@/lib/db/tasks";
import {
  buildConfigFromWorkflow,
  DEFAULT_WATCH_WORKFLOW_ID,
  DEFAULT_WATCH_WORKFLOW_VERSION,
} from "@/lib/workflow-snapshot";
import type { ChannelRow } from "@/lib/supabase/types";

const SEED_CHANNEL_URLS = [
  "https://www.youtube.com/@SUPERANT_AN",
  "https://www.youtube.com/@gamdongstockTV",
  "https://www.youtube.com/@closingpricebetting_TV",
  "https://www.youtube.com/@realstock_lab",
  "https://www.youtube.com/@hanriver_trading",
];

const VIDEOS_PER_CHANNEL = 2;
const MAX_ENQUEUE = 10;

const tq = (sb: ReturnType<typeof createSupabaseServerClient>) =>
  (sb as any).from("task_queue");

function orderKeyFromTitle(title: string): string {
  return (title ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

export type SeedChannelsResult = {
  ok: true;
  channels_registered: number;
  videos_upserted: number;
  videos_activated: number;
  enqueued: number;
  errors: string[];
};

export async function runSeedChannels(): Promise<
  SeedChannelsResult | { ok: false; error: string }
> {
  const errors: string[] = [];
  let channelsRegistered = 0;
  let videosUpserted = 0;
  let videosActivated = 0;

  try {
    for (const url of SEED_CHANNEL_URLS) {
      try {
        const info = await resolveChannelHandle(url);
        await upsertChannel({
          id: info.id,
          name: info.title,
          profile_url: info.thumbnail,
          thumbnail_url: info.thumbnail,
          subscriber_count: String(info.subscriberCount),
          video_count: info.videoCount,
          is_monitored: true,
          ...(info.handle != null ? { handle: info.handle } : {}),
        } as any);
        channelsRegistered++;

        const supabase = createSupabaseServerClient();
        const videos = await fetchRecentVideos(info.id, 8760);
        const latest = videos.slice(0, VIDEOS_PER_CHANNEL);

        for (const video of latest) {
          const parts = video.duration.split(":").map(Number);
          let durationSec = 0;
          if (parts.length === 3)
            durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];

          await upsertVideo({
            channel_id: info.id,
            id: video.videoId,
            title: video.title,
            channel_name: info.title,
            thumbnail_url: video.thumbnail,
            duration_sec: durationSec,
            source: "channel_auto",
          });
          videosUpserted++;

          await supabase
            .from("videos")
            .update({
              status: "active",
              target_views: 100,
              watch_duration_sec: 60,
              prob_like: 15,
              prob_comment: 5,
              search_keyword: video.title.replace(/#\S+/g, "").trim().slice(0, 50),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", video.videoId);
          videosActivated++;
        }
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const supabase = createSupabaseServerClient();
    const channels = await getAllChannels();
    const monitored = channels.filter((c: ChannelRow) => c.is_monitored);

    let queuedVideoIds: string[] = [];
    try {
      const { data: queuedItems } = await tq(supabase)
        .select("task_config, video_id")
        .eq("status", "queued");
      queuedVideoIds = (queuedItems ?? []).map(
        (r: { task_config?: { videoId?: string; video_id?: string }; video_id?: string }) =>
          (r.video_id ?? r.task_config?.videoId ?? r.task_config?.video_id) as string
      ).filter(Boolean);
    } catch {
      /* ignore */
    }

    const discoveredRunId = crypto.randomUUID();
    let totalEnqueued = 0;

    for (const channel of monitored) {
      if (!(channel as any).auto_collect || totalEnqueued >= MAX_ENQUEUE) continue;
      try {
        const activeVideos = await getVideosByChannelIdWithFilters(channel.id, {
          status: "active",
          sort_by: "created_at",
        });
        const sorted = [...activeVideos].sort((a, b) => {
          const ta = new Date(a.created_at ?? 0).getTime();
          const tb = new Date(b.created_at ?? 0).getTime();
          if (ta !== tb) return ta - tb;
          return orderKeyFromTitle((a as { title?: string }).title ?? "").localeCompare(
            orderKeyFromTitle((b as { title?: string }).title ?? ""),
            "ko-KR"
          );
        });
        for (const v of sorted) {
          if (totalEnqueued >= MAX_ENQUEUE) break;
          const hasTask = await getTaskByVideoId(v.id);
          if (hasTask || queuedVideoIds.includes(v.id)) continue;

          const title = (v as { title?: string }).title ?? "";
          const keyword = (v as { search_keyword?: string }).search_keyword ?? title ?? v.id;
          const videoUrl = `https://www.youtube.com/watch?v=${v.id}`;
          const inputs = {
            videoId: v.id,
            channelId: channel.id,
            keyword,
            video_url: videoUrl,
          };
          const workflowConfig = await buildConfigFromWorkflow(
            DEFAULT_WATCH_WORKFLOW_ID,
            DEFAULT_WATCH_WORKFLOW_VERSION,
            inputs
          );
          const durationSec = (v as { duration_sec?: number }).duration_sec ?? 0;
          const description = (v as { description?: string }).description ?? "";
          const insertRow: Record<string, unknown> = {
            task_config: {
              ...workflowConfig,
              contentMode: "single",
              videoId: v.id,
              channelId: channel.id,
              channel: channel.id,
              video_url: videoUrl,
              title,
              keyword,
              영상제목: title,
              영상본문: description,
              영상길이초: durationSec,
              영상주소: videoUrl,
              영상키워드: keyword,
            },
            priority: 5,
            status: "queued",
            video_id: v.id,
            discovered_run_id: discoveredRunId,
            order_key: orderKeyFromTitle(title),
            source: "channel_auto",
          };
          const { error: eqErr } = await tq(supabase).insert(insertRow);
          if (!eqErr) {
            queuedVideoIds.push(v.id);
            totalEnqueued++;
          }
        }
      } catch (err) {
        errors.push(`enqueue ${channel.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      ok: true,
      channels_registered: channelsRegistered,
      videos_upserted: videosUpserted,
      videos_activated: videosActivated,
      enqueued: totalEnqueued,
      errors,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Seed failed",
    };
  }
}
