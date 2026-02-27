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
 *
 * Task-devices flow (MVP queue -> dispatch -> verify):
 *   node tests/seed-e2e-mvp.js   # output E2E_CHANNEL_ID, E2E_VIDEO_ID
 *   export E2E_CHANNEL_ID=... E2E_VIDEO_ID=... CRON_SECRET=...
 *   node tests/e2e-local.js --task-devices
 * Requires: Next.js running (BASE_URL, default http://localhost:3000), CRON_SECRET.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../agent/.env") });
require("dotenv").config({ path: require("path").join(__dirname, "../.env.local") });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_NAME = process.env.WORKER_NAME || "local-test-pc";
const SKIP_CLEANUP = process.argv.includes("--no-cleanup");
const TASK_DEVICES_FLOW = process.argv.includes("--task-devices");

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
  logStep(1, "Agent startup + Supabase/Xiaowei connection check");

  // 1a. Check worker exists and is online
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

  // 1b. Verify Supabase connection (worker exists = Supabase is working)
  logOK(`Supabase connected (worker found in DB)`);

  // 1c. Verify Xiaowei connection status
  if (data.xiaowei_connected) {
    logOK(`Xiaowei connected`);
  } else {
    logFail(`Xiaowei not connected (xiaowei_connected=${data.xiaowei_connected})`);
    logInfo("Check: Is Xiaowei running? (ws://127.0.0.1:22222/)");
    logInfo("Check: Firewall/port blocking?");
    return false;
  }

  // 1d. Verify heartbeat freshness
  if (data.last_heartbeat) {
    const age = Date.now() - new Date(data.last_heartbeat).getTime();
    if (age > 120000) {
      logFail(`Heartbeat stale (${Math.round(age / 1000)}s ago). Agent may be down.`);
      logInfo("Check: Is agent process running? (node agent.js)");
      return false;
    }
    logOK(`Heartbeat OK (${Math.round(age / 1000)}s ago)`);
  } else {
    logFail("No heartbeat recorded yet");
    return false;
  }

  // 1e. Summary
  logOK(`Status: ${data.status}, devices: ${data.device_count}`);
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
    logOK(`  ${d.serial} | ${d.model || "unknown"} | status=${d.status} | battery=${d.battery_level ?? "?"}%`);
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

// ─── Step 3: Proxy assignment check ──────────────────────

async function step3_checkProxies() {
  logStep(3, "Proxy assignment + verification");

  // 3a. Query proxies assigned to devices for this worker
  const { data: proxies, error: proxyErr } = await supabase
    .from("proxies")
    .select("id, address, username, type, status, device_id")
    .eq("worker_id", workerId)
    .not("device_id", "is", null);

  if (proxyErr) {
    logFail(`Failed to query proxies: ${proxyErr.message}`);
    return false;
  }

  if (!proxies || proxies.length === 0) {
    logInfo("No proxy assignments found for this worker (skipping proxy checks)");
    logInfo("To test proxies: Dashboard > Proxies > Bulk Import, then auto-assign");
    return true; // Non-blocking — proxy setup is optional
  }

  logOK(`Found ${proxies.length} proxy assignment(s)`);

  // 3b. Get device serials for each proxy
  const deviceIds = proxies.map((p) => p.device_id);
  const { data: proxyDevices, error: devErr } = await supabase
    .from("devices")
    .select("id, serial, proxy_id")
    .in("id", deviceIds);

  if (devErr) {
    logFail(`Failed to query proxy devices: ${devErr.message}`);
    return false;
  }

  const deviceMap = new Map();
  for (const d of (proxyDevices || [])) {
    deviceMap.set(d.id, d);
  }

  // 3c. Verify each proxy-device pair
  let okCount = 0;
  for (const proxy of proxies) {
    const device = deviceMap.get(proxy.device_id);
    const serial = device ? device.serial : "unknown";
    const creds = proxy.username ? `${proxy.username}:***@` : "";
    const proxyUrl = `${proxy.type || "socks5"}://${creds}${proxy.address}`;

    // Check bidirectional FK consistency
    const fkOk = device && device.proxy_id === proxy.id;

    if (fkOk) {
      logOK(`${serial} ← proxy: ${proxyUrl} ✓`);
      okCount++;
    } else if (device && !device.proxy_id) {
      logFail(`${serial} ← proxy: ${proxyUrl} (device.proxy_id is null — FK mismatch)`);
    } else {
      logFail(`${serial} ← proxy: ${proxyUrl} (device not found or FK mismatch)`);
    }
  }

  logOK(`${okCount}/${proxies.length} 프록시 배정 완료`);

  if (okCount < proxies.length) {
    logInfo("Some proxy-device FK links are inconsistent. Use Dashboard auto-assign to fix.");
  }

  return true;
}

// ─── Step 4: Account assignment + YouTube login check ────

async function step4_checkAccounts() {
  logStep(4, "Account assignment + YouTube login check");

  // 4a. Query accounts assigned to devices for this worker
  const { data: accounts, error: accErr } = await supabase
    .from("accounts")
    .select("id, email, status, device_id, last_login")
    .eq("worker_id", workerId)
    .not("device_id", "is", null);

  if (accErr) {
    logFail(`Failed to query accounts: ${accErr.message}`);
    return false;
  }

  if (!accounts || accounts.length === 0) {
    logInfo("No account assignments found for this worker (skipping account checks)");
    logInfo("To test accounts: Dashboard > Accounts > Add, then assign to devices");
    return true; // Non-blocking
  }

  logOK(`Found ${accounts.length} account assignment(s)`);

  // 4b. Get device serials for each account
  const deviceIds = accounts.map((a) => a.device_id);
  const { data: accDevices, error: devErr } = await supabase
    .from("devices")
    .select("id, serial, account_id")
    .in("id", deviceIds);

  if (devErr) {
    logFail(`Failed to query account devices: ${devErr.message}`);
    return false;
  }

  const deviceMap = new Map();
  for (const d of (accDevices || [])) {
    deviceMap.set(d.id, d);
  }

  // 4c. Verify each account-device pair
  let okCount = 0;
  for (const account of accounts) {
    const device = deviceMap.get(account.device_id);
    const serial = device ? device.serial : "unknown";

    // Check bidirectional FK consistency
    const fkOk = device && device.account_id === account.id;

    // Check account status is usable
    const statusOk = ["available", "in_use"].includes(account.status);

    if (fkOk && statusOk) {
      const loginAge = account.last_login
        ? `${Math.round((Date.now() - new Date(account.last_login).getTime()) / 3600000)}h ago`
        : "never";
      logOK(`${serial} ← ${account.email} (status=${account.status}, login=${loginAge}) ✓`);
      okCount++;
    } else if (!fkOk) {
      logFail(`${serial} ← ${account.email} (device.account_id FK mismatch)`);
    } else {
      logFail(`${serial} ← ${account.email} (status=${account.status} — not usable)`);
    }
  }

  logOK(`${okCount}/${accounts.length} 계정 배정 확인 완료`);

  if (okCount < accounts.length) {
    logInfo("Some accounts have issues. Check status (banned/cooldown) or FK consistency.");
  }

  return true;
}

// ─── Step 5: Script deployment check ─────────────────────

async function step5_checkScripts() {
  logStep(5, "AutoJS script deployment check");

  // 5a. Check worker metadata for SCRIPTS_DIR
  const { data: worker, error: wErr } = await supabase
    .from("workers")
    .select("*")
    .eq("id", workerId)
    .single();

  if (wErr) {
    logFail(`Failed to query worker: ${wErr.message}`);
    return false;
  }

  const meta = worker.metadata || {};
  if (meta.scripts_dir) {
    logOK(`SCRIPTS_DIR configured: ${meta.scripts_dir}`);
  } else {
    logInfo("SCRIPTS_DIR not reported in worker metadata (agent logs to stdout)");
  }

  // 5b. Check task_logs for script verification entries
  const { data: scriptLogs } = await supabase
    .from("task_logs")
    .select("*")
    .eq("worker_id", workerId)
    .like("message", "%script%")
    .order("created_at", { ascending: false })
    .limit(5);

  if (scriptLogs && scriptLogs.length > 0) {
    logOK(`Found ${scriptLogs.length} script-related log(s)`);
    for (const log of scriptLogs) {
      const ts = new Date(log.created_at).toLocaleTimeString("ko-KR");
      logOK(`  [${ts}] ${log.message}`);
    }
  } else {
    logInfo("No script-related logs in DB (agent logs to stdout, not DB)");
  }

  // 5c. Verify agent has script execution capability
  if (worker.status === "online" && worker.xiaowei_connected) {
    logOK("Agent online + Xiaowei connected → script execution capable");
    logInfo("Agent-side: ScriptVerifier checks SCRIPTS_DIR, required scripts (youtube_watch.js), test execution");
  } else {
    logInfo(`Agent status=${worker.status}, xiaowei=${worker.xiaowei_connected}`);
    logInfo("Script execution may not be available until agent is fully connected");
  }

  logOK("Script deployment check complete");
  return true;
}

// ─── Step 6: Find real channel + recent video ───────────

async function step6_findRecentVideo() {
  logStep(6, "Find channel & most recent video from DB");

  // Get channels with is_monitored
  const { data: channels, error: chErr } = await supabase
    .from("channels")
    .select("id, name, profile_url")
    .eq("is_monitored", true)
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
    logOK(`  ${ch.name} (${ch.id})`);
  }

  // For each channel, find the most recently created video
  for (const ch of channels) {
    const { data: videos, error: vErr } = await supabase
      .from("videos")
      .select("id, title, status, duration_sec")
      .eq("channel_id", ch.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (vErr || !videos || videos.length === 0) continue;

    const candidate = videos.find((v) => v.status === "active" || v.status === "new") || videos[0];

    channel = ch;
    video = candidate;

    logOK(`Selected channel: ${ch.name}`);
    logOK(`Selected video: "${video.title}"`);
    logOK(`  YouTube ID: ${video.id}`);
    logOK(`  Duration: ${video.duration_sec ? `${Math.round(video.duration_sec / 60)}min` : "unknown"}`);
    logOK(`  Current status: ${video.status}`);
    return true;
  }

  logFail("No videos found in any channel. Run the video detection pipeline first.");
  return false;
}

// ─── Step 7: Create watch task ──────────────────────────

async function step7_createTask() {
  const count = deviceCount || devices.length || 3;
  logStep(7, `Create watch_video task (device_count=${count})`);

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

// ─── Step 8: Track execution ────────────────────────────

async function step8_trackExecution() {
  logStep(8, "Track execution: pending -> running -> completed/failed");

  // 8a. Wait for agent to claim the task + measure latency
  const claimStart = Date.now();
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
    const claimMs = Date.now() - claimStart;
    const claimSec = (claimMs / 1000).toFixed(1);
    logOK(`Agent claimed task (worker_id set)`);

    // Broadcast/Realtime typically responds in <5s; polling interval is 30s+
    if (claimMs < 8000) {
      logOK(`수신 방식: Broadcast/Realtime (${claimSec}s — 빠른 응답)`);
    } else if (claimMs < 35000) {
      logInfo(`수신 방식: polling 가능성 (${claimSec}s — Broadcast가 비활성일 수 있음)`);
    } else {
      logInfo(`수신 지연: ${claimSec}s — Realtime/Broadcast 연결 확인 필요`);
    }
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

// ─── Step 9: Verify logs ────────────────────────────────

async function step9_verifyLogs() {
  logStep(9, "Verify task_logs pipeline (insert + query + field check)");

  // 9a. Check if agent created any logs for this task
  const { data: agentLogs } = await supabase
    .from("task_logs")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  const agentCount = agentLogs?.length || 0;
  logOK(`Agent log entries: ${agentCount}`);

  if (agentCount === 0) {
    logInfo("No agent logs yet. Verifying log pipeline directly.");
  }

  // 9b. Validate agent log field completeness
  if (agentCount > 0) {
    const requiredFields = ["task_id", "worker_id", "level", "action", "message", "created_at"];
    let fieldOkCount = 0;

    for (const log of agentLogs) {
      const missing = requiredFields.filter((f) => !log[f]);
      if (missing.length === 0) {
        fieldOkCount++;
      } else {
        logFail(`  Log ${log.id}: missing fields: ${missing.join(", ")}`);
      }
    }

    if (fieldOkCount === agentCount) {
      logOK(`필수 필드 검증: ${fieldOkCount}/${agentCount} OK (task_id, worker_id, level, action, message)`);
    } else {
      logInfo(`필수 필드 검증: ${fieldOkCount}/${agentCount} — some logs have missing fields`);
    }

    // 9c. Check log level mapping (success → info, error → error)
    const validLevels = ["debug", "info", "warn", "error", "fatal"];
    const invalidLevelLogs = agentLogs.filter((l) => l.level && !validLevels.includes(l.level));
    if (invalidLevelLogs.length === 0) {
      logOK(`log_level 매핑: 모든 로그가 유효한 enum 값 사용 (${validLevels.join("/")})`);
    } else {
      logFail(`log_level 매핑: ${invalidLevelLogs.length}개 로그에 잘못된 level 값`);
    }

    // 9d. Check for duration in message (from STEP 6 TaskExecutor enhancement)
    const withDuration = agentLogs.filter((l) => l.message && /\(\d+\.\d+s\)/.test(l.message));
    if (withDuration.length > 0) {
      logOK(`실행 시간 기록: ${withDuration.length}개 로그에 duration 포함`);
    } else {
      logInfo("실행 시간 기록: duration 정보 없음 (이전 버전 agent일 수 있음)");
    }
  }

  // 9e. Insert test log entry to verify the pipeline works end-to-end
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

  // 9f. Read back all logs and display
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

  // 9g. Verify round-trip: inserted log should appear in read-back
  const found = allLogs.find((l) => l.id === testLog.id);
  if (found) {
    logOK("Pipeline round-trip: insert → read OK ✓");
  } else {
    logFail("Pipeline round-trip: inserted log not found in read-back ✗");
  }

  return true;
}

// ─── Step 10: Final status verification + result aggregation ─

async function step10_finalStatus() {
  logStep(10, "Final status verification + result aggregation");

  // 10a. Re-check worker status (still online after execution?)
  const { data: worker, error: wErr } = await supabase
    .from("workers")
    .select("*")
    .eq("id", workerId)
    .single();

  if (wErr) {
    logFail(`Failed to query worker: ${wErr.message}`);
    return false;
  }

  if (worker.status === "online") {
    logOK(`Worker status: online ✓`);
  } else {
    logFail(`Worker status: ${worker.status} (expected online)`);
  }

  if (worker.xiaowei_connected) {
    logOK(`Xiaowei: connected ✓`);
  } else {
    logFail(`Xiaowei: disconnected (expected connected)`);
  }

  // 10b. Check worker metadata (execution stats from heartbeat)
  const meta = worker.metadata || {};
  if (meta.task_stats) {
    const ts = meta.task_stats;
    logOK(`Task stats: total=${ts.total}, succeeded=${ts.succeeded}, failed=${ts.failed}, running=${ts.running}`);
  } else {
    logInfo("Task stats: not reported in worker metadata (heartbeat may not have fired yet)");
  }

  if (meta.subscriptions) {
    const sub = meta.subscriptions;
    logOK(`Subscriptions: broadcast=${sub.broadcast}, pg_changes=${sub.pg_changes}`);
    if (sub.broadcast_received > 0 || sub.pg_changes_received > 0) {
      logOK(`  Received: broadcast=${sub.broadcast_received}, pg_changes=${sub.pg_changes_received} (last via: ${sub.last_via || "n/a"})`);
    }
  } else {
    logInfo("Subscription status: not reported in worker metadata");
  }

  if (meta.log_stats) {
    logOK(`Log pipeline: inserted=${meta.log_stats.inserted}, failed=${meta.log_stats.failed}`);
  }

  if (meta.uptime_sec) {
    const upMin = (meta.uptime_sec / 60).toFixed(1);
    logOK(`Agent uptime: ${upMin}min (started: ${meta.started_at || "unknown"})`);
  }

  // 10c. Verify task final status
  if (taskId) {
    const { data: task, error: tErr } = await supabase
      .from("tasks")
      .select("status, started_at, completed_at, error, retry_count, result")
      .eq("id", taskId)
      .single();

    if (tErr) {
      logFail(`Failed to query task: ${tErr.message}`);
    } else {
      const status = task.status;
      if (status === "completed" || status === "done") {
        logOK(`Task final status: ${status} ✓`);
      } else {
        logFail(`Task final status: ${status} (expected completed/done)`);
      }

      if (task.started_at && task.completed_at) {
        const durationMs = new Date(task.completed_at) - new Date(task.started_at);
        logOK(`Task duration: ${(durationMs / 1000).toFixed(1)}s (${task.started_at} → ${task.completed_at})`);
      }

      if (task.error) {
        logFail(`Task error: ${task.error}`);
      }
      if (task.retry_count > 0) {
        logInfo(`Retry count: ${task.retry_count}`);
      }
    }

    // 10d. Count log entries for this task
    const { count: logCount } = await supabase
      .from("task_logs")
      .select("id", { count: "exact", head: true })
      .eq("task_id", taskId);

    logOK(`Task log entries: ${logCount || 0}`);
  }

  // 10e. Verify video status
  if (video) {
    const { data: vid, error: vErr } = await supabase
      .from("videos")
      .select("status, updated_at")
      .eq("id", video.id)
      .single();

    if (vErr) {
      logFail(`Failed to query video: ${vErr.message}`);
    } else {
      logOK(`Video status: ${vid.status} (was: ${video.status})`);
      logOK(`Video updated at: ${vid.updated_at}`);
    }
  }

  return true;
}

// ─── Step 11: Cleanup ───────────────────────────────────

async function step11_cleanup() {
  logStep(11, SKIP_CLEANUP ? "Cleanup SKIPPED (--no-cleanup)" : "Cleanup test task");

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

// ─── Task-devices flow (MVP: queue → dispatch → verify) ──

async function runTaskDevicesFlow() {
  const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
  const CRON_SECRET = process.env.CRON_SECRET;
  const channelId = process.env.E2E_CHANNEL_ID;
  const videoId = process.env.E2E_VIDEO_ID;

  console.log("\n[E2E] ── task_devices flow (queue → dispatch → verify) ──");
  console.log(`  BASE_URL: ${BASE_URL}`);
  if (!channelId || !videoId) {
    console.error("  E2E_CHANNEL_ID and E2E_VIDEO_ID required. Run: node tests/seed-e2e-mvp.js");
    process.exit(1);
  }
  if (!CRON_SECRET) {
    console.error("  CRON_SECRET required for GET /api/cron/dispatch-queue");
    process.exit(1);
  }

  const videoUrl = process.env.E2E_VIDEO_URL || `https://www.youtube.com/watch?v=${process.env.E2E_VIDEO_YOUTUBE_ID || videoId}`;

  // 1) POST /api/queue
  logStep("TD-1", "POST /api/queue");
  let queueRes;
  try {
    queueRes = await fetch(`${BASE_URL}/api/queue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_config: {
          videoId,
          channelId,
          video_url: videoUrl,
          keyword: videoId,
        },
        priority: 5,
        source: "channel_auto",
      }),
    });
  } catch (err) {
    logFail(`Queue POST failed: ${err.message}. Is Next.js running at ${BASE_URL}?`);
    process.exit(1);
  }
  if (!queueRes.ok) {
    const text = await queueRes.text();
    logFail(`Queue POST ${queueRes.status}: ${text}`);
    process.exit(1);
  }
  logOK("Queue item created");

  // 2) GET /api/cron/dispatch-queue (Bearer CRON_SECRET)
  logStep("TD-2", "GET /api/cron/dispatch-queue");
  let dispatchRes;
  try {
    dispatchRes = await fetch(`${BASE_URL}/api/cron/dispatch-queue`, {
      method: "GET",
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
  } catch (err) {
    logFail(`Dispatch GET failed: ${err.message}`);
    process.exit(1);
  }
  if (!dispatchRes.ok) {
    const text = await dispatchRes.text();
    logFail(`Dispatch GET ${dispatchRes.status}: ${text}`);
    process.exit(1);
  }
  const dispatchJson = await dispatchRes.json();
  if (!dispatchJson.ok || dispatchJson.dispatched !== 1) {
    logFail(`Dispatch did not dispatch 1 item: ${JSON.stringify(dispatchJson)}`);
    process.exit(1);
  }
  const taskId = dispatchJson.task_id;
  logOK(`Dispatched task_id: ${taskId}`);

  // 3) Poll for task_devices completed or tasks.devices_done >= 1
  logStep("TD-3", "Poll for task_devices/tasks completion");
  process.stdout.write("  Waiting for at least one task_device completed");
  let done = false;
  try {
    const result = await waitForCondition("task_devices completed", async () => {
      const { data: tdRows } = await supabase
        .from("task_devices")
        .select("id, status")
        .eq("task_id", taskId);
      const completed = (tdRows || []).filter((r) => r.status === "completed").length;
      if (completed > 0) {
        return { completed, total: (tdRows || []).length };
      }
      const { data: taskRow } = await supabase
        .from("tasks")
        .select("devices_done, devices_failed, devices_total")
        .eq("id", taskId)
        .single();
      if (taskRow && (taskRow.devices_done || 0) >= 1) {
        return { completed: taskRow.devices_done, total: taskRow.devices_total };
      }
      return null;
    }, 120000, 3000);
    console.log("");
    logOK(`Completed: ${result.completed} (total: ${result.total})`);
    done = true;
  } catch {
    console.log("");
    logFail("No task_device completed within 120s. Is the agent running with task_devices engine?");
  }

  console.log("\n[E2E] task_devices flow " + (done ? "PASSED" : "FAILED") + "\n");
  process.exit(done ? 0 : 1);
}

// ─── Main ───────────────────────────────────────────────

async function main() {
  if (TASK_DEVICES_FLOW) {
    await runTaskDevicesFlow();
    return;
  }

  console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("\u2551  DoAi.Me - E2E Test (Real Channel Data)          \u2551");
  console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");
  console.log(`  Worker:   ${WORKER_NAME}`);
  console.log(`  Supabase: ${SUPABASE_URL}`);
  console.log(`  Cleanup:  ${SKIP_CLEANUP ? "disabled" : "enabled"}`);

  const steps = [
    { name: "Worker check",       fn: step1_checkWorker,       critical: true },
    { name: "Device check",       fn: step2_checkDevices,      critical: true },
    { name: "Proxy check",        fn: step3_checkProxies,      critical: false },
    { name: "Account check",      fn: step4_checkAccounts,     critical: false },
    { name: "Script check",       fn: step5_checkScripts,      critical: false },
    { name: "Find recent video",  fn: step6_findRecentVideo,   critical: true },
    { name: "Create watch task",  fn: step7_createTask,        critical: true },
    { name: "Track execution",    fn: step8_trackExecution,    critical: false },
    { name: "Verify logs",        fn: step9_verifyLogs,        critical: false },
    { name: "Final status",      fn: step10_finalStatus,       critical: false },
  ];

  const results = [];
  const e2eStartTime = Date.now();

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
  await step11_cleanup();

  // ─── Summary ────────────────────────────────────────
  const e2eDuration = ((Date.now() - e2eStartTime) / 1000).toFixed(1);
  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  console.log("\n\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557");
  console.log("\u2551  Test Summary                                    \u2551");
  console.log("\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d");

  for (let i = 0; i < steps.length; i++) {
    const passed = results[i] === true;
    const skipped = results[i] === undefined;
    const icon = skipped ? "- SKIP" : passed ? "\u2713 PASS" : "\u2717 FAIL";
    if (passed) passCount++;
    else if (skipped) skipCount++;
    else failCount++;
    console.log(`  ${icon}  ${i + 1}. ${steps[i].name}`);
  }

  console.log(`\n  Results: ${passCount} passed, ${failCount} failed, ${skipCount} skipped (${e2eDuration}s)`);

  if (channel && video) {
    console.log(`  Channel: ${channel.name}`);
    console.log(`  Video:   ${video.title}`);
    console.log(`  Task:    ${taskId || "not created"}`);
  }

  const allPassed = failCount === 0;
  console.log("");
  if (allPassed) {
    console.log(`  \u2713 All tests passed! (${e2eDuration}s)`);
  } else {
    console.log(`  \u2717 ${failCount} test(s) failed. Check the output above.`);
  }

  process.exit(allPassed ? 0 : 1);
}

main();
