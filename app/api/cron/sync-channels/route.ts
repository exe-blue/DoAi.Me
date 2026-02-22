import { NextResponse } from "next/server";
import { resolveChannelHandle, fetchRecentVideos } from "@/lib/youtube";
import { getAllChannels, upsertChannel } from "@/lib/db/channels";
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
 * monitoring_enabled 채널의 최근 영상을 YouTube API로 가져와 videos 테이블에 upsert.
 */
export async function GET(request: Request) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const channels = await getAllChannels();
    const monitored = channels.filter((c: ChannelRow) => c.monitoring_enabled);

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
          channel.youtube_channel_id,
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
            youtube_video_id: video.videoId,
            title: video.title,
            thumbnail_url: video.thumbnail,
            published_at: video.publishedAt,
            duration_seconds: durationSec,
            auto_detected: true,
          });

          // 새 영상인지 판별
          const createdMs = new Date(upserted.created_at ?? "").getTime();
          const updatedMs = new Date(upserted.updated_at ?? "").getTime();
          if (Math.abs(updatedMs - createdMs) < 5000) {
            totalNew++;
            console.log(`[Cron] New video: "${video.title}" (${channel.channel_name})`);
          } else {
            totalUpdated++;
          }
        }
      } catch (err) {
        errors++;
        console.error(
          `[Cron] Sync failed for ${channel.channel_name}:`,
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