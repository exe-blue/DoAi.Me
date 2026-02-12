#!/usr/bin/env node
/**
 * Seed YouTube channels and their latest videos into Supabase
 */
require("dotenv").config({ path: require("path").join(__dirname, "../agent/.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../.env.local") });

const { createClient } = require("@supabase/supabase-js");

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!YOUTUBE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  const missing = [
    !YOUTUBE_API_KEY && "YOUTUBE_API_KEY",
    !SUPABASE_URL && "SUPABASE_URL",
    !SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);
  console.error("Missing required env vars: " + missing.join(", "));
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const handles = [
  "SUPERANT_AN",
  "gamdongstockTV",
  "closingpricebetting_TV",
  "realstock_lab",
  "hanriver_trading",
];

async function fetchJSON(url) {
  const res = await fetch(url);
  if (res.status !== 200) {
    const text = await res.text();
    throw new Error("HTTP " + res.status + ": " + text.substring(0, 200));
  }
  return res.json();
}

function parseDuration(iso) {
  const match = (iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (match === null) return 0;
  return (parseInt(match[1] || "0") * 3600) +
         (parseInt(match[2] || "0") * 60) +
         parseInt(match[3] || "0");
}

async function registerChannel(handle) {
  try {
    // 1. Search for channel by handle
    const searchUrl =
      "https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=%40" +
      handle + "&key=" + YOUTUBE_API_KEY;
    const searchData = await fetchJSON(searchUrl);

    if (searchData.items === undefined || searchData.items.length === 0) {
      console.log("  SKIP: Channel @" + handle + " not found");
      return null;
    }

    const channelId = searchData.items[0].snippet.channelId;
    const channelTitle = searchData.items[0].snippet.title;
    const thumbnail = searchData.items[0].snippet.thumbnails
      ? searchData.items[0].snippet.thumbnails.default
        ? searchData.items[0].snippet.thumbnails.default.url
        : null
      : null;

    // 2. Insert channel into DB
    const { data: ch, error: chErr } = await sb
      .from("channels")
      .upsert(
        {
          youtube_channel_id: channelId,
          channel_name: channelTitle,
          channel_url: "https://www.youtube.com/@" + handle,
          thumbnail_url: thumbnail,
          monitoring_enabled: true,
        },
        { onConflict: "youtube_channel_id" }
      )
      .select("id, youtube_channel_id, channel_name")
      .single();

    if (chErr) {
      console.log("  ERROR inserting channel @" + handle + ": " + chErr.message);
      return null;
    }

    console.log("  Channel: " + ch.channel_name + " (" + ch.youtube_channel_id + ")");

    // 3. Fetch latest 3 videos
    const videosUrl =
      "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=" +
      channelId +
      "&order=date&type=video&maxResults=3&key=" +
      YOUTUBE_API_KEY;
    const videosData = await fetchJSON(videosUrl);

    if (videosData.items === undefined || videosData.items.length === 0) {
      console.log("    No recent videos found");
      return ch;
    }

    // 4. Get video details
    const videoIds = videosData.items.map(function (v) { return v.id.videoId; }).join(",");
    const detailsUrl =
      "https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=" +
      videoIds +
      "&key=" +
      YOUTUBE_API_KEY;
    const detailsData = await fetchJSON(detailsUrl);

    var items = detailsData.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var seconds = parseDuration(item.contentDetails ? item.contentDetails.duration : null);
      var title = item.snippet ? item.snippet.title || "Untitled" : "Untitled";
      var desc = item.snippet ? (item.snippet.description || "").substring(0, 500) : "";
      var thumb = null;
      if (item.snippet && item.snippet.thumbnails && item.snippet.thumbnails.medium) {
        thumb = item.snippet.thumbnails.medium.url;
      }
      var publishedAt = item.snippet ? item.snippet.publishedAt : null;
      var viewCount = item.statistics ? parseInt(item.statistics.viewCount || "0") : 0;
      var likeCount = item.statistics ? parseInt(item.statistics.likeCount || "0") : 0;

      var { data: vid, error: vErr } = await sb
        .from("videos")
        .upsert(
          {
            channel_id: ch.id,
            youtube_video_id: item.id,
            title: title,
            description: desc,
            thumbnail_url: thumb,
            published_at: publishedAt,
            duration_seconds: seconds,
            view_count: viewCount,
            like_count: likeCount,
            status: "detected",
          },
          { onConflict: "youtube_video_id" }
        )
        .select("id, youtube_video_id, title")
        .single();

      if (vErr) {
        console.log("    ERROR inserting video: " + vErr.message);
      } else {
        console.log(
          "    Video: " +
            (vid.title || "[untitled]").substring(0, 60) +
            " (" +
            vid.youtube_video_id +
            ") " +
            seconds +
            "s"
        );
      }
    }

    return ch;
  } catch (err) {
    console.log("  ERROR for @" + handle + ": " + err.message);
    return null;
  }
}

(async function () {
  console.log("=== Registering YouTube Channels ===\n");
  for (var j = 0; j < handles.length; j++) {
    console.log("Processing @" + handles[j] + "...");
    await registerChannel(handles[j]);
    console.log("");
  }
  console.log("Done.");
})();
