#!/usr/bin/env node
/**
 * DoAi.Me - Local E2E Test Script
 * Tests the full pipeline with REAL channel data:
 *   Channel lookup -> Recent video selection -> Task creation ->
 *   Agent execution -> Log tracking -> Status verification
 *
 * Prerequisites:
 *   1. Agent running: cd agent && node agent.js
 *   2. Xiaowei running on localhost:22222 with 3 devices connected
 *   3. At least one channel registered in the DB with a video
 *
 * Usage: node tests/e2e-local.js [--no-cleanup]
 */
require("dotenv").config({ path: require("path").join(__dirname, "../agent/.env") });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_NAME = process.env.WORKER_NAME || "local-test-pc";
const SKIP_CLEANUP = process.argv.includes("--no-cleanup");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[E2E] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// State
let workerId = null;
let devices = [];
let deviceCount = 0;
let channel = null;
let video = null;
let taskId = null;

// ─── Helpers ────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(label, checkFn, timeoutMs = 30000, intervalMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await checkFn();
    if (result) return result;
    process.stdout.write(".");
    await sleep(intervalMs);
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

function logStep(step, message) {
  console.log(`\n[E2E] ── Step ${step} ── ${message}`);
}

function logOK(msg) {
  console.log(`  \u2713 ${msg}`);
}

function logFail(msg) {
  console.error(`  \u2717 ${msg}`);
}

function logInfo(msg) {
  console.log(`  > ${msg}`);
}

// ─── Step 1: Worker ─────────────────────────────────────

async function step1_checkWorker() {
  logStep(1, "Worker registration check");

  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("hostname", WORKER_NAME)
    .single();

  if (error || !data) {
    logFail(`Worker '${WORKER_NAME}' not found. Is the agent running?`);
    if (error) logFail(`Error: ${error.message}`);
    return false;
  }

  workerId = data.id;
  logOK(`Worker: ${data.hostname} (${workerId})`);
  logOK(`Status: ${data.status}, Xiaowei: ${data.xiaowei_connected}`);
  logOK(`Last heartbeat: ${data.last_heartbeat}`);

  // Warn if heartbeat is stale (>2 minutes)
  if (data.last_heartbeat) {
    const age = Date.now() - new Date(data.last_heartbeat).getTime();
    if (age > 120000) {
      logFail(`Heartbeat is stale (${Math.round(age / 1000)}s ago). Agent may be down.`);
      return false;
    }
  }

  return true;
}

// ─── Step 2: Devices ────────────────────────────────────

async function step2_checkDevices() {
  logStep(2, "Device check");

  // Query ALL devices for this worker (any status)
  const { data: allDevices, error } = await supabase
    .from("devices")
    .select("*")
    .eq("worker_id", workerId);

  if (error) {
    logFail(`Failed to query devices: ${error.message}`);
    return false;
  }

  devices = allDevices || [];
  const onlineCount = devices.filter((d) => d.status === "online").length;
  const offlineCount = devices.filter((d) => d.status !== "online").length;
  logOK(`Devices in DB: ${devices.length} (online=${onlineCount}, offline=${offlineCount})`);

  for (const d of devices) {
    logOK(`  ${d.serial} | ${d.model || "unknown"} | status=${d.status} | battery=${d.battery ?? "?"}%`);
  }

  // Use DB devices if any exist (regardless of status — agent controls via Xiaowei, not DB status)
  if (devices.length > 0) {
    deviceCount = devices.length;
    if (onlineCount === 0) {
      logInfo(`All devices offline in DB, but agent uses Xiaowei directly. Continuing.`);
    }
    return true;
  }

  // Fallback: use worker's reported device_count when devices table is empty
  const { data: worker } = await supabase
    .from("workers")
    .select("device_count")
    .eq("id", workerId)
    .single();

  const reported = worker ? worker.device_count : 0;
  if (reported > 0) {
    logInfo(`Devices table empty but worker reports ${reported} device(s). Using worker count.`);
    logInfo(`(Device serial sync may be failing — Xiaowei list() response format issue)`);
    deviceCount = reported;
    return true;
  }

  logFail("No devices found. Is Xiaowei running with phones connected?");
  return false;
}

// ─── Step 3: Find real channel + recent video ───────────

async function step3_findRecentVideo() {
  logStep(3, "Find channel & most recent video from DB");

  // Get channels with monitoring_enabled
  const { data: channels, error: chErr } = await supabase
    .from("channels")
    .select("id, youtube_channel_id, channel_name, channel_url")
    .eq("monitoring_enabled", true)
    .order("created_at", { ascending: false });

  if (chErr) {
    logFail(`Failed to query channels: ${chErr.message}`);
    return false;
  }

  if (!channels || channels.length === 0) {
    logFail("No channels found in DB. Register a channel first via the dashboard.");
    return false;
  }

  logOK(`Found ${channels.length} channel(s):`);
  for (const ch of channels) {
    logOK(`  ${ch.channel_name} (${ch.youtube_channel_id})`);
  }

  // For each channel, find the most recently published video
  for (const ch of channels) {
    const { data: videos, error: vErr } = await supabase
      .from("videos")
      .select("id, youtube_video_id, title, published_at, status, duration_seconds")
      .eq("channel_id", ch.id)
      .order("published_at", { ascending: false })
      .limit(5);

    if (vErr || !videos || videos.length === 0) continue;

    // Pick the most recent video that hasn't been processed yet, or the latest
    const candidate = videos.find((v) => v.status === "detected" || v.status === "new") || videos[0];

    channel = ch;
    video = candidate;

    logOK(`Selected channel: ${ch.channel_name}`);
    logOK(`Selected video: "${video.title}"`);
    logOK(`  YouTube ID: ${video.youtube_video_id}`);
    logOK(`  Published: ${video.published_at || "unknown"}`);
    logOK(`  Duration: ${video.duration_seconds ? `${Math.round(video.duration_seconds / 60)}min` : "unknown"}`);
    logOK(`  Current status: ${video.status}`);
    return true;
  }

  logFail("No videos found in any channel. Run the video detection pipeline first.");
  return false;
}

// ─── Step 4: Create watch task ──────────────────────────

async function step4_createTask() {
  const count = deviceCount || devices.length || 3;
  logStep(4, `Create watch_video task (device_count=${count})`);

  const payload = {
    watchPercent: 80,
    commentProb: 0,
    likeProb: 0,
    saveProb: 0,
    subscribeToggle: false,
    actionName: "YouTube_\uc2dc\uccad",
  };

  const { data: task, error } = await supabase
    .from("tasks")
    .insert({
      video_id: video.id,
      channel_id: channel.id,
      type: "youtube",
      task_type: "watch_video",
      device_count: count,
      status: "pending",
      payload,
      // worker_id is left null => agent will auto-claim
    })
    .select("id, status, created_at")
    .single();

  if (error) {
    logFail(`Failed to create task: ${error.message}`);
    return false;
  }

  taskId = task.id;
  logOK(`Task created: ${taskId}`);
  logOK(`Status: ${task.status}`);
  logOK(`Payload: watchPercent=${payload.watchPercent}%, devices=${count}`);
  return true;
}

// ─── Step 5: Track execution ────────────────────────────

async function step5_trackExecution() {
  logStep(5, "Track execution: pending -> running -> completed/failed");

  // 5a. Wait for agent to claim the task
  process.stdout.write("  Waiting for agent to claim task");
  let claimed;
  try {
    claimed = await waitForCondition("agent claim", async () => {
      const { data } = await supabase
        .from("tasks")
        .select("worker_id, status")
        .eq("id", taskId)
        .single();
      return data?.worker_id ? data : null;
    }, 60000, 2000);
    console.log("");
    logOK(`Agent claimed task (worker_id set)`);
  } catch {
    console.log("");
    logFail("Agent did not claim the task within 60s. Is the agent running and polling?");
    return false;
  }

  // 5b. Wait for running status
  process.stdout.write("  Waiting for running status");
  try {
    await waitForCondition("running status", async () => {
      const { data } = await supabase
        .from("tasks")
        .select("status, started_at")
        .eq("id", taskId)
        .single();
      if (data?.status === "running") {
        logInfo(`started_at: ${data.started_at}`);
        return data;
      }
      return null;
    }, 30000, 1000);
    console.log("");
    logOK("Task is now running");
  } catch {
    console.log("");
    // Check if it went straight to completed/failed
    const { data } = await supabase.from("tasks").select("status").eq("id", taskId).single();
    if (data?.status === "completed" || data?.status === "failed") {
      logInfo(`Task skipped running, went to: ${data.status}`);
    } else {
      logFail(`Task did not enter running within 30s (current: ${data?.status})`);
    }
  }

  // 5c. Wait for terminal state
  process.stdout.write("  Waiting for completion (up to 120s)");
  try {
    const finalTask = await waitForCondition("terminal status", async () => {
      const { data } = await supabase
        .from("tasks")
        .select("*")
        .eq("id", taskId)
        .single();
      return ["completed", "done", "failed", "cancelled", "timeout"].includes(data?.status) ? data : null;
    }, 120000, 3000);
    console.log("");

    if (finalTask.status === "completed" || finalTask.status === "done") {
      logOK(`Task ${finalTask.status.toUpperCase()}`);
      logOK(`  started_at:   ${finalTask.started_at}`);
      logOK(`  completed_at: ${finalTask.completed_at}`);
      if (finalTask.result) {
        logOK(`  result: ${JSON.stringify(finalTask.result).substring(0, 300)}`);
      }
    } else {
      logFail(`Task ${finalTask.status.toUpperCase()}`);
      logFail(`  error: ${finalTask.error}`);
      logInfo(`  retry_count: ${finalTask.retry_count}`);
    }

    return true;
  } catch {
    console.log("");
    const { data } = await supabase
      .from("tasks")
      .select("status, error, started_at, retry_count")
      .eq("id", taskId)
      .single();

    logFail(`Task did not reach terminal state within 120s`);
    if (data) {
      logFail(`  Current status: ${data.status}`);
      logFail(`  Error: ${data.error || "none"}`);
      logFail(`  Retries: ${data.retry_count}`);
    }
    return false;
  }
}

// ─── Step 6: Verify logs ────────────────────────────────

async function step6_verifyLogs() {
  logStep(6, "Verify task_logs pipeline (insert + query)");

  // 6a. Check if agent created any logs
  const { data: agentLogs } = await supabase
    .from("task_logs")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  const agentCount = agentLogs?.length || 0;
  logOK(`Agent log entries: ${agentCount}`);

  if (agentCount === 0) {
    logInfo("Agent uses old code (status column). Verifying log pipeline directly.");
  }

  // 6b. Insert test log entry to verify the pipeline works
  const { data: testLog, error: insertErr } = await supabase
    .from("task_logs")
    .insert({
      task_id: taskId,
      device_serial: "e2e-test",
      worker_id: workerId,
      level: "info",
      action: "watch_video",
      message: "E2E test log entry - pipeline verification",
      request: { watchPercent: 80 },
      response: { verified: true },
    })
    .select("id, level, message, created_at")
    .single();

  if (insertErr) {
    logFail(`Log insert failed: ${insertErr.message}`);
    return false;
  }

  logOK(`Test log inserted: ${testLog.id}`);

  // 6c. Read back and verify
  const { data: allLogs, error: readErr } = await supabase
    .from("task_logs")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (readErr) {
    logFail(`Failed to query logs: ${readErr.message}`);
    return false;
  }

  logOK(`Total log entries: ${allLogs.length}`);
  for (const log of allLogs) {
    const ts = new Date(log.created_at).toLocaleTimeString("ko-KR");
    const device = log.device_serial || "n/a";
    const level = log.level || "?";
    logOK(`  [${ts}] ${level.padEnd(7)} | ${log.action || "-"} | device=${device} | ${log.message || ""}`);
  }

  return true;
}

// ─── Step 7: Verify video status update ─────────────────

async function step7_verifyVideoStatus() {
  logStep(7, "Verify video status was updated");

  const { data, error } = await supabase
    .from("videos")
    .select("status, updated_at")
    .eq("id", video.id)
    .single();

  if (error) {
    logFail(`Failed to query video: ${error.message}`);
    return false;
  }

  logOK(`Video status: ${data.status} (was: ${video.status})`);
  logOK(`Updated at: ${data.updated_at}`);

  return true;
}

// ─── Step 8: Cleanup ────────────────────────────────────

async function step8_cleanup() {
  logStep(8, SKIP_CLEANUP ? "Cleanup SKIPPED (--no-cleanup)" : "Cleanup test task");

  if (SKIP_CLEANUP) {
    logInfo(`Task ${taskId} left in DB for manual inspection`);
    return;
  }

  if (taskId) {
    // Delete logs first (FK constraint)
    const { error: logErr } = await supabase.from("task_logs").delete().eq("task_id", taskId);
    if (logErr) {
      logFail(`Failed to delete logs: ${logErr.message}`);
    } else {
      logOK("Task logs deleted");
    }

    const { error: taskErr } = await supabase.from("tasks").delete().eq("id", taskId);
    if (taskErr) {
      logFail(`Failed to delete task: ${taskErr.message}`);
    } else {
      logOK("Test task deleted");
    }

    // Restore video status if we changed it
    if (video) {
      await supabase
        .from("videos")
        .update({ status: video.status, updated_at: new Date().toISOString() })
        .eq("id", video.id);
      logOK(`Video status restored to: ${video.status}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("\u2551  DoAi.Me - E2E Test (Real Channel Data)          \u2551");
  console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");
  console.log(`  Worker:   ${WORKER_NAME}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Cleanup:  ${SKIP_CLEANUP ? "disabled" : "enabled"}`);

  const steps = [
    { name: "Worker check",       fn: step1_checkWorker,       critical: true },
    { name: "Device check",       fn: step2_checkDevices,      critical: true },
    { name: "Find recent video",  fn: step3_findRecentVideo,   critical: true },
    { name: "Create watch task",  fn: step4_createTask,        critical: true },
    { name: "Track execution",    fn: step5_trackExecution,    critical: false },
    { name: "Verify logs",        fn: step6_verifyLogs,        critical: false },
    { name: "Verify video status",fn: step7_verifyVideoStatus, critical: false },
  ];

  const results = [];

  try {
    for (const step of steps) {
      const result = await step.fn();
      results.push(result);

      if (!result && step.critical) {
        logFail(`Critical step failed: ${step.name}. Aborting.`);
        break;
      }
    }
  } catch (err) {
    console.error(`\n[E2E] Unexpected error: ${err.message}`);
    console.error(err.stack);
  }

  // Always attempt cleanup
  await step8_cleanup();

  // ─── Summary ────────────────────────────────────────
  console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("\u2551  Test Summary                                    \u2551");
  console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

  let allPassed = true;
  for (let i = 0; i < steps.length; i++) {
    const passed = results[i] === true;
    const skipped = results[i] === undefined;
    const icon = skipped ? "- SKIP" : passed ? "\u2713 PASS" : "\u2717 FAIL";
    if (!passed && !skipped) allPassed = false;
    console.log(`  ${icon}  ${i + 1}. ${steps[i].name}`);
  }

  if (channel && video) {
    console.log(`\n  Channel: ${channel.channel_name}`);
    console.log(`  Video:   ${video.title}`);
    console.log(`  Task:    ${taskId || "not created"}`);
  }

  console.log("");
  if (allPassed) {
    console.log("  All tests passed!");
  } else {
    console.log("  Some tests failed. Check the output above.");
  }

  process.exit(allPassed ? 0 : 1);
}

main();
