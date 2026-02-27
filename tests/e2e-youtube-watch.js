#!/usr/bin/env node
/**
 * DoAi.Me - E2E YouTube Watch Test
 * Targets a single running agent client and verifies end-to-end YouTube task execution.
 *
 * Prerequisites:
 *   1. agent.js running on at least one Windows PC (workers table has online record)
 *   2. At least one online device connected to that worker
 *   3. videos table has an active record (or test inserts a dummy)
 *
 * Usage:
 *   node tests/e2e-youtube-watch.js
 *   node tests/e2e-youtube-watch.js --no-cleanup   # leave task/logs in DB for inspection
 *   node tests/e2e-youtube-watch.js --worker <id>  # target a specific worker UUID
 *
 * Env (loaded from agent/.env):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
require("dotenv").config({ path: require("path").join(__dirname, "../agent/.env") });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SKIP_CLEANUP = process.argv.includes("--no-cleanup");

// Optional: --worker <uuid> to pin to a specific worker
const workerArgIdx = process.argv.indexOf("--worker");
const FORCED_WORKER_ID = workerArgIdx !== -1 ? process.argv[workerArgIdx + 1] : null;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[E2E] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── State ───────────────────────────────────────────────
let targetWorker = null;   // { id, name, hostname }
let targetDevice = null;   // { id, serial }
let targetVideo = null;    // { id, title, video_id }
let taskId = null;
let dummyVideoInserted = false;

// ─── Helpers ─────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until condition(result) is truthy or timeout expires.
 * @param {Function} fn       async function returning the value to check
 * @param {Function} condition predicate; return truthy to stop polling
 * @param {number} timeoutMs
 * @param {number} intervalMs
 */
async function pollUntil(fn, condition, timeoutMs, intervalMs = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const result = await fn();
    if (condition(result)) return result;
    process.stdout.write(".");
    await sleep(intervalMs);
  }
  throw new Error(`Timeout after ${timeoutMs / 1000}s`);
}

function logStep(n, msg) {
  console.log(`\n[E2E] ── Step ${n} ── ${msg}`);
}
function ok(msg)   { console.log(`  \u2713 ${msg}`); }
function fail(msg) { console.error(`  \u2717 ${msg}`); }
function info(msg) { console.log(`  > ${msg}`); }

// ─── Step 1: Select a running worker ─────────────────────

async function step1_selectWorker() {
  logStep(1, "Select an online worker (running agent)");

  let data, error;

  if (FORCED_WORKER_ID) {
    ({ data, error } = await supabase
      .from("workers")
      .select("id, name, hostname, status, last_heartbeat, device_count")
      .eq("id", FORCED_WORKER_ID)
      .single());
  } else {
    ({ data, error } = await supabase
      .from("workers")
      .select("id, name, hostname, status, last_heartbeat, device_count")
      .eq("status", "online")
      .order("last_heartbeat", { ascending: false })
      .limit(1)
      .single());
  }

  if (error || !data) {
    fail(`No online worker found${FORCED_WORKER_ID ? ` with id ${FORCED_WORKER_ID}` : ""}. Is the agent running?`);
    if (error) fail(`  DB error: ${error.message}`);
    return false;
  }

  // Verify heartbeat freshness (< 2 min)
  if (data.last_heartbeat) {
    const ageMs = Date.now() - new Date(data.last_heartbeat).getTime();
    if (ageMs > 120000) {
      fail(`Worker heartbeat is stale (${Math.round(ageMs / 1000)}s ago). Agent may be down.`);
      return false;
    }
    ok(`Heartbeat fresh: ${Math.round(ageMs / 1000)}s ago`);
  }

  targetWorker = data;
  ok(`Worker: ${data.hostname || data.name} (${data.id})`);
  info(`  status=${data.status}, devices=${data.device_count}, heartbeat=${data.last_heartbeat}`);
  return true;
}

// ─── Step 2: Verify an online device exists ───────────────

async function step2_selectDevice() {
  logStep(2, "Verify online device on target worker");

  const { data, error } = await supabase
    .from("devices")
    .select("id, serial, model, status, battery_level")
    .eq("worker_id", targetWorker.id)
    .eq("status", "online")
    .limit(1)
    .single();

  if (error || !data) {
    // Fallback: any device (agent talks to Xiaowei directly, DB status may lag)
    const { data: any, error: anyErr } = await supabase
      .from("devices")
      .select("id, serial, model, status")
      .eq("worker_id", targetWorker.id)
      .limit(1)
      .single();

    if (anyErr || !any) {
      fail("No devices found for this worker. Is Xiaowei running with phones connected?");
      return false;
    }

    info(`No 'online' device in DB, using: ${any.serial} (status=${any.status})`);
    info("  Agent communicates with Xiaowei directly — DB status may lag heartbeat.");
    targetDevice = any;
    return true;
  }

  targetDevice = data;
  ok(`Device: ${data.serial} | ${data.model || "unknown"} | battery=${data.battery_level ?? "?"}%`);
  return true;
}

// ─── Step 3: Select test video ───────────────────────────

async function step3_selectVideo() {
  logStep(3, "Select active video (or insert dummy)");

  const { data, error } = await supabase
    .from("videos")
    .select("id, title, video_id, status, duration_sec")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!error && data) {
    targetVideo = data;
    ok(`Video: "${data.title}"`);
    info(`  id=${data.id}, yt_video_id=${data.video_id}, status=${data.status}`);
    return true;
  }

  // No active video — insert a minimal dummy record for the test
  info("No active videos found. Inserting temporary test record...");

  const { data: dummy, error: insertErr } = await supabase
    .from("videos")
    .insert({
      title: "[E2E Test] YouTube Watch",
      video_id: "dQw4w9WgXcQ", // well-known public video
      status: "active",
      duration_sec: 30,
    })
    .select("id, title, video_id, status")
    .single();

  if (insertErr || !dummy) {
    fail(`Failed to insert dummy video: ${insertErr?.message}`);
    return false;
  }

  dummyVideoInserted = true;
  targetVideo = dummy;
  ok(`Dummy video inserted: "${dummy.title}" (id=${dummy.id})`);
  return true;
}

// ─── Step 4: Create YouTube watch task ───────────────────

async function step4_createTask() {
  logStep(4, "Create YouTube watch task (worker-targeted)");

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      task_type: "youtube",
      status: "pending",
      worker_id: targetWorker.id,   // target this specific agent
      video_id: targetVideo.id,
      payload: {
        watch_duration: 30,
        watchPercent: 80,
        actionName: "YouTube_시청",
        device_serial: targetDevice.serial,
      },
    })
    .select("id, status, created_at")
    .single();

  if (error || !data) {
    fail(`Failed to create task: ${error?.message}`);
    return false;
  }

  taskId = data.id;
  ok(`Task created: ${taskId}`);
  ok(`  status=${data.status}, worker=${targetWorker.id}`);
  return true;
}

// ─── Step 5: Wait for agent to claim the task ────────────

async function step5_waitForClaim() {
  logStep(5, "Wait for agent claim (Broadcast <8s, polling up to 30s)");

  const claimStart = Date.now();
  process.stdout.write("  Waiting");

  let claimed;
  try {
    claimed = await pollUntil(
      async () => {
        const { data } = await supabase
          .from("tasks")
          .select("status, worker_id")
          .eq("id", taskId)
          .single();
        return data;
      },
      (data) => data && ["assigned", "running", "done", "completed", "failed"].includes(data.status),
      30000,
      2000
    );
    console.log("");
  } catch {
    console.log("");
    fail("Agent did not claim the task within 30s.");
    info("  Check: Is the agent process running? (node agent.js)");
    info("  Check: Is Supabase Realtime / Broadcast active?");
    return false;
  }

  const claimMs = Date.now() - claimStart;
  const claimSec = (claimMs / 1000).toFixed(1);

  ok(`Agent claimed task (status=${claimed.status}) in ${claimSec}s`);

  if (claimMs < 8000) {
    ok(`  수신 방식: Broadcast/Realtime (빠른 응답)`);
  } else if (claimMs < 35000) {
    info(`  수신 방식: polling 가능성 (${claimSec}s — Broadcast 비활성 확인 필요)`);
  }

  return true;
}

// ─── Step 6: Wait for task completion ────────────────────

async function step6_waitForCompletion() {
  logStep(6, "Wait for task completion (up to 120s)");

  process.stdout.write("  Executing");

  let finalTask;
  try {
    finalTask = await pollUntil(
      async () => {
        const { data } = await supabase
          .from("tasks")
          .select("id, status, started_at, completed_at, error, result, retry_count")
          .eq("id", taskId)
          .single();
        return data;
      },
      (data) => data && ["done", "completed", "failed", "cancelled", "timeout"].includes(data.status),
      120000,
      3000
    );
    console.log("");
  } catch {
    console.log("");
    const { data: current } = await supabase
      .from("tasks")
      .select("status, error")
      .eq("id", taskId)
      .single();

    fail(`Task did not reach terminal state within 120s (current: ${current?.status})`);
    if (current?.error) fail(`  error: ${current.error}`);
    return false;
  }

  const isSuccess = ["done", "completed"].includes(finalTask.status);

  if (isSuccess) {
    ok(`Task ${finalTask.status.toUpperCase()}`);
    if (finalTask.started_at && finalTask.completed_at) {
      const durationMs = new Date(finalTask.completed_at) - new Date(finalTask.started_at);
      ok(`  Duration: ${(durationMs / 1000).toFixed(1)}s`);
    }
    if (finalTask.result) {
      ok(`  Result: ${JSON.stringify(finalTask.result).substring(0, 200)}`);
    }
  } else {
    fail(`Task ${finalTask.status.toUpperCase()}`);
    if (finalTask.error) fail(`  Error: ${finalTask.error}`);
    if (finalTask.retry_count > 0) info(`  Retries: ${finalTask.retry_count}`);
  }

  return isSuccess;
}

// ─── Step 7: Verify execution logs ───────────────────────

async function step7_verifyLogs() {
  logStep(7, "Verify execution evidence in task_logs");

  const { data: logs, error } = await supabase
    .from("task_logs")
    .select("id, level, action, message, device_serial, created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    fail(`Failed to query logs: ${error.message}`);
    return false;
  }

  const logCount = logs?.length || 0;
  ok(`Log entries: ${logCount}`);

  if (logCount === 0) {
    fail("No logs found — agent may not have written execution logs");
    return false;
  }

  // Check for at least one info-level log
  const infoLogs = logs.filter((l) => l.level === "info");
  if (infoLogs.length > 0) {
    ok(`  info-level logs: ${infoLogs.length}`);
  } else {
    info("  No info-level logs found (only debug/warn/error)");
  }

  // Display log summary
  for (const log of logs) {
    const ts = new Date(log.created_at).toLocaleTimeString("ko-KR");
    const dev = log.device_serial || "n/a";
    ok(`  [${ts}] ${(log.level || "?").padEnd(5)} | ${log.action || "-"} | dev=${dev} | ${log.message || ""}`);
  }

  // Re-check final task status
  const { data: finalTask } = await supabase
    .from("tasks")
    .select("status")
    .eq("id", taskId)
    .single();

  const isSuccess = ["done", "completed"].includes(finalTask?.status);
  if (isSuccess) {
    ok(`Final status: ${finalTask.status} ✓`);
  } else {
    fail(`Final status: ${finalTask?.status} (expected done/completed)`);
  }

  return infoLogs.length > 0 && isSuccess;
}

// ─── Cleanup ─────────────────────────────────────────────

async function cleanup() {
  if (SKIP_CLEANUP) {
    info(`\n  Cleanup skipped (--no-cleanup). Task ${taskId} left in DB.`);
    return;
  }

  logStep("C", "Cleanup");

  if (taskId) {
    const { error: logErr } = await supabase.from("task_logs").delete().eq("task_id", taskId);
    if (!logErr) ok("task_logs deleted");

    const { error: taskErr } = await supabase.from("tasks").delete().eq("id", taskId);
    if (!taskErr) ok("task deleted");
  }

  if (dummyVideoInserted && targetVideo) {
    const { error } = await supabase.from("videos").delete().eq("id", targetVideo.id);
    if (!error) ok(`Dummy video removed (${targetVideo.id})`);
  }
}

// ─── Main ─────────────────────────────────────────────────

async function main() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║  DoAi.Me - E2E YouTube Watch Test              ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log(`  Supabase: ${SUPABASE_URL}`);
  if (FORCED_WORKER_ID) console.log(`  Target worker: ${FORCED_WORKER_ID}`);
  console.log(`  Cleanup: ${SKIP_CLEANUP ? "disabled" : "enabled"}`);

  const steps = [
    { name: "Select online worker",      fn: step1_selectWorker,      critical: true },
    { name: "Verify device",             fn: step2_selectDevice,      critical: true },
    { name: "Select video",              fn: step3_selectVideo,       critical: true },
    { name: "Create task",               fn: step4_createTask,        critical: true },
    { name: "Wait for agent claim",      fn: step5_waitForClaim,      critical: true },
    { name: "Wait for completion",       fn: step6_waitForCompletion, critical: true },
    { name: "Verify logs",               fn: step7_verifyLogs,        critical: false },
  ];

  const results = [];
  const e2eStart = Date.now();

  try {
    for (const step of steps) {
      const result = await step.fn();
      results.push(result);
      if (!result && step.critical) {
        fail(`Critical step failed. Aborting.`);
        break;
      }
    }
  } catch (err) {
    console.error(`\n[E2E] Unexpected error: ${err.message}`);
    console.error(err.stack);
  }

  await cleanup();

  // Summary
  const elapsed = ((Date.now() - e2eStart) / 1000).toFixed(1);
  let pass = 0, failed = 0, skipped = 0;

  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║  Test Summary                                  ║");
  console.log("╚════════════════════════════════════════════════╝");

  for (let i = 0; i < steps.length; i++) {
    const r = results[i];
    const icon = r === undefined ? "- SKIP" : r ? "\u2713 PASS" : "\u2717 FAIL";
    if (r === true) pass++;
    else if (r === undefined) skipped++;
    else failed++;
    console.log(`  ${icon}  ${i + 1}. ${steps[i].name}`);
  }

  console.log(`\n  Results: ${pass} passed, ${failed} failed, ${skipped} skipped (${elapsed}s)`);
  if (targetWorker) console.log(`  Worker:  ${targetWorker.hostname || targetWorker.name}`);
  if (targetVideo)  console.log(`  Video:   ${targetVideo.title}`);
  if (taskId)       console.log(`  Task:    ${taskId}`);

  console.log("");
  const allPassed = failed === 0;
  if (allPassed) {
    console.log("  \u2713 PASS — YouTube watch E2E complete");
  } else {
    console.log(`  \u2717 FAIL — ${failed} step(s) failed`);
  }

  process.exit(allPassed ? 0 : 1);
}

main();
