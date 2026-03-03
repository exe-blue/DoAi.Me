import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function orderKeyFromTitle(title: string): string {
  return (title ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

async function fetchRecentVideos(apiKey: string, channelId: string, hoursAgo = 2) {
  const publishedAfter = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const searchUrl = new URL(`${YOUTUBE_API_BASE}/search`);
  searchUrl.searchParams.set("part", "snippet");
  searchUrl.searchParams.set("channelId", channelId);
  searchUrl.searchParams.set("publishedAfter", publishedAfter);
  searchUrl.searchParams.set("type", "video");
  searchUrl.searchParams.set("order", "date");
  searchUrl.searchParams.set("maxResults", "20");
  searchUrl.searchParams.set("key", apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) throw new Error(`YouTube search failed: ${searchRes.status}`);
  const searchData = await searchRes.json();
  if (!Array.isArray(searchData.items) || searchData.items.length === 0) return [];

  return searchData.items.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url ?? null,
  }));
}

Deno.serve(async () => {
  const startedAt = Date.now();
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ytKey = Deno.env.get("YOUTUBE_API_KEY")!;
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    const { data: channels, error: channelsError } = await supabase
      .from("channels")
      .select("id,name,is_monitored,auto_collect,default_watch_duration_sec,default_prob_like,default_prob_comment")
      .eq("is_monitored", true);
    if (channelsError) throw channelsError;

    const monitored = channels ?? [];
    if (monitored.length === 0) {
      return Response.json({ ok: true, channels_synced: 0, new_videos: 0, updated_videos: 0, enqueued: 0, errors: 0, elapsed_ms: Date.now() - startedAt });
    }

    let totalNew = 0;
    let totalUpdated = 0;
    let errors = 0;

    for (const channel of monitored) {
      try {
        const videos = await fetchRecentVideos(ytKey, channel.id, 2);
        for (const video of videos) {
          const { data: existing } = await supabase.from("videos").select("id,source").eq("id", video.videoId).maybeSingle();
          if (existing?.source === "manual") continue;

          const { error } = await supabase.from("videos").upsert({
            id: video.videoId,
            channel_id: channel.id,
            title: video.title,
            channel_name: channel.name ?? null,
            thumbnail_url: video.thumbnail,
            duration_sec: 0,
            source: "channel_auto",
            ...(channel.auto_collect
              ? {
                  status: "active",
                  target_views: 100,
                  watch_duration_sec: channel.default_watch_duration_sec ?? 60,
                  prob_like: channel.default_prob_like ?? 15,
                  prob_comment: channel.default_prob_comment ?? 5,
                  search_keyword: String(video.title ?? "").slice(0, 50),
                }
              : {}),
          });
          if (error) throw error;
          if (existing) totalUpdated++; else totalNew++;
        }
      } catch {
        errors++;
      }
    }

    const { data: lockAcquired } = await supabase.rpc("try_sync_lock");
    if (!lockAcquired) {
      return Response.json({ ok: true, channels_synced: monitored.length, new_videos: totalNew, updated_videos: totalUpdated, enqueued: 0, errors, elapsed_ms: Date.now() - startedAt });
    }

    let enqueued = 0;
    try {
      const discoveredRunId = crypto.randomUUID();
      const { data: activeVideos } = await supabase
        .from("videos")
        .select("id,title,channel_id,search_keyword")
        .eq("status", "active")
        .eq("source", "channel_auto");

      for (const v of activeVideos ?? []) {
        const keyword = v.search_keyword ?? v.title ?? v.id;
        const insert = await supabase.from("task_queue").insert({
          priority: 5,
          status: "queued",
          video_id: v.id,
          discovered_run_id: discoveredRunId,
          order_key: orderKeyFromTitle(v.title ?? ""),
          source: "channel_auto",
          task_config: {
            contentMode: "single",
            videoId: v.id,
            channelId: v.channel_id,
            keyword,
            video_url: `https://www.youtube.com/watch?v=${v.id}`,
          },
        });
        if (!insert.error) enqueued++;
      }
    } finally {
      await supabase.rpc("release_sync_lock");
    }

    return Response.json({ ok: true, channels_synced: monitored.length, new_videos: totalNew, updated_videos: totalUpdated, enqueued, errors, elapsed_ms: Date.now() - startedAt });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Sync failed" }, { status: 500 });
  }
});
