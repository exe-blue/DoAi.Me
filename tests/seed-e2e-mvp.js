#!/usr/bin/env node
/**
 * E2E MVP seed: 1 PC, 1+ devices, 1 channel, 1 video.
 * Use before running task_devices E2E (e2e-local.js task_devices flow).
 *
 * Prerequisites: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in agent/.env or .env.local
 *
 * Usage: node tests/seed-e2e-mvp.js
 *
 * By default uses a real public channel/video (Google Developers + "Me at the zoo")
 * so E2E can run without YouTube API and agent/youtube can actually search/watch.
 * Set E2E_USE_REAL_YT=0 to use random channel/video IDs instead.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../agent/.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../.env.local") });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PC_NUMBER = process.env.E2E_PC_NUMBER || "PC01";
const DEVICE_SERIAL = process.env.E2E_DEVICE_SERIAL || "E2E-DEVICE-001";
/** Use real YouTube channel/video for E2E (no API key). Set E2E_USE_REAL_YT=0 to use random IDs. */
const USE_REAL_YT = process.env.E2E_USE_REAL_YT !== "0";

// Real public channel/video for E2E (Google Developers + short clip; 실제 검색·시청 가능)
const REAL_YT_CHANNEL = {
  youtube_channel_id: "UC_x5XG1OV2P6uZZ5FSM9Ttw",
  channel_name: "Google Developers",
  channel_url: "https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
};
const REAL_YT_VIDEO = {
  youtube_video_id: "jNQXAC9IVRw",
  title: "Me at the zoo",
  youtube_url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
};

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function seed() {
  console.log("=== E2E MVP seed: PC + devices + channel + video ===\n");

  // 1. PC
  let pcId;
  const { data: existingPc } = await sb.from("pcs").select("id").eq("pc_number", PC_NUMBER).maybeSingle();
  if (existingPc) {
    pcId = existingPc.id;
    console.log("  PC: existing", PC_NUMBER, pcId);
  } else {
    const { data: pc, error: pcErr } = await sb
      .from("pcs")
      .insert({ pc_number: PC_NUMBER, status: "offline" })
      .select("id")
      .single();
    if (pcErr) {
      console.error("  PC insert failed:", pcErr.message);
      throw pcErr;
    }
    pcId = pc.id;
    console.log("  PC: created", PC_NUMBER, pcId);
  }

  // 2. Device(s)
  const serials = DEVICE_SERIAL.split(",").map((s) => s.trim()).filter(Boolean);
  for (const serial of serials) {
    const { error: devErr } = await sb
      .from("devices")
      .upsert(
        { serial, pc_id: pcId, status: "online", last_seen: new Date().toISOString() },
        { onConflict: "serial" }
      );
    if (devErr) {
      console.error("  Device upsert failed:", devErr.message);
      throw devErr;
    }
    console.log("  Device: upserted", serial);
  }

  // 3. Channel (real YT or random)
  const channelPayload = USE_REAL_YT
    ? { ...REAL_YT_CHANNEL, monitoring_enabled: false }
    : {
        youtube_channel_id: "E2E_CHANNEL_" + Date.now(),
        channel_name: "E2E Test Channel",
        channel_url: "https://www.youtube.com/channel/E2E_CHANNEL_" + Date.now(),
        monitoring_enabled: false,
      };
  const { data: ch, error: chErr } = await sb
    .from("channels")
    .upsert(channelPayload, { onConflict: "youtube_channel_id" })
    .select("id")
    .single();
  if (chErr) {
    console.error("  Channel upsert failed:", chErr.message);
    throw chErr;
  }
  const channelId = ch.id;
  console.log("  Channel: upserted", channelId, channelPayload.youtube_channel_id, USE_REAL_YT ? "(real)" : "");

  // 4. Video (real YT or random)
  const videoPayload = USE_REAL_YT
    ? {
        channel_id: channelId,
        youtube_video_id: REAL_YT_VIDEO.youtube_video_id,
        title: REAL_YT_VIDEO.title,
        status: "active",
        youtube_url: REAL_YT_VIDEO.youtube_url,
      }
    : {
        channel_id: channelId,
        youtube_video_id: "e2etest" + Date.now().toString(36).slice(-8),
        title: "E2E Test Video",
        status: "active",
        youtube_url: "https://www.youtube.com/watch?v=e2etest",
      };
  if (!USE_REAL_YT) {
    videoPayload.youtube_url = "https://www.youtube.com/watch?v=" + videoPayload.youtube_video_id;
  }
  const { data: vid, error: vidErr } = await sb
    .from("videos")
    .upsert(videoPayload, { onConflict: "youtube_video_id" })
    .select("id")
    .single();
  if (vidErr) {
    console.error("  Video upsert failed:", vidErr.message);
    throw vidErr;
  }
  const videoId = vid.id;
  const youtubeVideoId = videoPayload.youtube_video_id;
  console.log("  Video: upserted", videoId, youtubeVideoId, USE_REAL_YT ? "(real)" : "");

  console.log("\n--- Seed output (use in E2E) ---");
  console.log("E2E_PC_NUMBER=" + PC_NUMBER);
  console.log("E2E_PC_ID=" + pcId);
  console.log("E2E_CHANNEL_ID=" + channelId);
  console.log("E2E_VIDEO_ID=" + videoId);
  console.log("E2E_VIDEO_YOUTUBE_ID=" + youtubeVideoId);
  console.log("\nDone.");
  return { pcId, channelId, videoId, youtubeVideoId };
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
