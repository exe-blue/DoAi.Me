import { NextResponse } from "next/server";
import { fetchRecentVideos } from "@/lib/youtube";
import { getAllChannels } from "@/lib/db/channels";
import { upsertVideo } from "@/lib/db/videos";
import type { ChannelRow } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel function timeout

// Vercel Cron 보안: CRON_SECRET 검증
function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET) return true; // 개발환경 허용
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * GET /api/cron/sync-channels
 * Vercel Cron에서 1분마다 호출.
 * is_monitored 채널의 최근 영상을 YouTube API로 가져와 videos 테이블에 upsert.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const channels = await getAllChannels();
    const monitored = channels.filter((c: ChannelRow) => c.is_monitored);

    if (monitored.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No monitored channels",
        elapsed_ms: Date.now() - startTime,
      });
    }

    let totalNew = 0;
    let totalUpdated = 0;
    let errors = 0;

    // 채널별 순차 처리 (YouTube API rate limit 고려)
    for (const channel of monitored) {
      try {
        // 최근 2시간 영상 조회 (1분 주기이므로 2시간이면 충분)
        const videos = await fetchRecentVideos(
          channel.id,
          2 // hours
        );

        for (const video of videos) {
          // Duration 파싱
          const parts = video.duration.split(":").map(Number);
          let durationSec = 0;
          if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
          else if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];

          const upserted = await upsertVideo({
            channel_id: channel.id,
            id: video.videoId,
            title: video.title,
            channel_name: channel.name || null,
            thumbnail_url: video.thumbnail,
            duration_sec: durationSec,
          });

          // 새 영상인지 판별
          const createdMs = new Date(upserted.created_at ?? "").getTime();
          const updatedMs = new Date(upserted.updated_at ?? "").getTime();
          const isNew = Math.abs(updatedMs - createdMs) < 5000;

          if (isNew) {
            totalNew++;
            console.log(`[Cron] New video: "${video.title}" (${channel.name})`);

            // 새 영상 자동 활성화 (auto_collect 설정된 채널만)
            if ((channel as any).auto_collect) {
              const supabase = (await import("@/lib/supabase/server")).createServerClient();
              await supabase.from("videos").update({
                status: "active",
                target_views: 100,
                watch_duration_sec: (channel as any).default_watch_duration_sec || 60,
                prob_like: (channel as any).default_prob_like || 15,
                prob_comment: (channel as any).default_prob_comment || 5,
                search_keyword: video.title.replace(/#\S+/g, "").trim().substring(0, 50),
              }).eq("id", video.videoId);
              console.log(`[Cron] Auto-activated: "${video.title}"`);
            }
          } else {
            totalUpdated++;
          }
        }
      } catch (err) {
        errors++;
        console.error(
          `[Cron] Sync failed for ${channel.name}:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(
      `[Cron] Sync complete: ${monitored.length} channels, ${totalNew} new, ${totalUpdated} updated, ${errors} errors (${elapsed}ms)`
    );

    return NextResponse.json({
      ok: true,
      channels_synced: monitored.length,
      new_videos: totalNew,
      updated_videos: totalUpdated,
      errors,
      elapsed_ms: elapsed,
    });
  } catch (error) {
    console.error("[Cron] Fatal sync error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}