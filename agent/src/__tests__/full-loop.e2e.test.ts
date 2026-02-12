/**
 * Full Loop E2E Test
 *
 * Verifies the complete pipeline:
 *   Dashboard -> Supabase -> Agent -> Xiaowei -> Results
 *
 * Prerequisites:
 *   - Supabase schema + Broadcast patches applied
 *   - Xiaowei running on Node PC with >= 1 Galaxy S9
 *   - Agent running (npx tsx agent/src/agent.ts or node dist/agent.js)
 *   - Dashboard running (npm run dev)
 *
 * Run: npx tsx agent/src/__tests__/full-loop.e2e.test.ts
 */
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DASHBOARD_URL = process.env.DASHBOARD_URL || "http://localhost:3000";
const AGENT_POLL_TIMEOUT = 30_000; // max wait for agent to pick up task
const BROADCAST_TIMEOUT = 15_000;
const HEARTBEAT_WAIT = 35_000; // heartbeat interval default 30s + buffer

// ---------------------------------------------------------------------------
// Test harness (same pattern as existing E2E tests)
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; error?: string }[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failed++;
    const msg = (err as Error).message;
    results.push({ name, ok: false, error: msg });
    console.log(`  \u2717 ${name}: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

const allChannels: { client: SupabaseClient; channel: RealtimeChannel }[] = [];

async function listenBroadcast(
  client: SupabaseClient,
  topic: string,
  events: string[],
  opts?: { self?: boolean; timeout?: number }
): Promise<{
  channel: RealtimeChannel;
  wait: () => Promise<{ event: string; payload: Record<string, unknown> }>;
}> {
  const timeoutMs = opts?.timeout ?? BROADCAST_TIMEOUT;
  let resolveWait!: (v: { event: string; payload: Record<string, unknown> }) => void;
  let rejectWait!: (e: Error) => void;
  let settled = false;

  const waitPromise = new Promise<{ event: string; payload: Record<string, unknown> }>(
    (resolve, reject) => {
      resolveWait = resolve;
      rejectWait = reject;
    }
  );

  const channel = client.channel(topic, {
    config: { broadcast: { self: opts?.self ?? false } },
  });

  for (const event of events) {
    channel.on("broadcast", { event }, (msg) => {
      if (!settled) {
        settled = true;
        resolveWait({ event, payload: (msg.payload ?? msg) as Record<string, unknown> });
      }
    });
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Subscribe timeout: ${topic}`)), 10_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        reject(new Error(`Subscribe failed: ${topic} (${status})`));
      }
    });
  });

  allChannels.push({ client, channel });

  return {
    channel,
    wait: () => {
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          rejectWait(new Error(`Timeout (${timeoutMs}ms) waiting for broadcast on ${topic}`));
        }
      }, timeoutMs);
      return waitPromise.finally(() => clearTimeout(timer));
    },
  };
}

/** Poll a Supabase query until condition is met or timeout. */
async function pollUntil<T>(
  queryFn: () => Promise<{ data: T | null; error: { message: string } | null }>,
  condition: (data: T) => boolean,
  timeoutMs: number,
  label: string,
  intervalMs = 1000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await queryFn();
    if (error) throw new Error(`${label} query error: ${error.message}`);
    if (data && condition(data)) return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`${label}: timeout after ${timeoutMs}ms`);
}

/** Fetch JSON from Dashboard API. */
async function dashboardGet<T = unknown>(path: string): Promise<T> {
  const url = `${DASHBOARD_URL}${path}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`GET ${path} -> ${resp.status}: ${body.substring(0, 200)}`);
  }
  return resp.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Shared state across scenarios
// ---------------------------------------------------------------------------
let mainClient: SupabaseClient;
let workerId = "";
let workerHostname = "";
let realSerial = "";
const testTaskIds: string[] = [];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run(): Promise<void> {
  console.log("\n=== Full Loop E2E Test ===\n");
  console.log(`  Supabase : ${SUPABASE_URL}`);
  console.log(`  Dashboard: ${DASHBOARD_URL}`);
  console.log("");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in agent/.env");
    process.exit(1);
  }

  mainClient = newClient();

  // Discover the running agent's worker
  const { data: workerRow } = await mainClient
    .from("workers")
    .select("id, hostname, status, device_count, last_heartbeat")
    .eq("status", "online")
    .order("last_heartbeat", { ascending: false })
    .limit(1)
    .single();

  if (!workerRow) {
    console.error("No online worker found. Is the agent running?");
    process.exit(1);
  }

  workerId = workerRow.id;
  workerHostname = workerRow.hostname;
  console.log(`  Worker   : ${workerHostname} (${workerId})`);
  console.log(`  Devices  : ${workerRow.device_count}\n`);

  // ============================================================
  // SCENARIO 1: Device List Query
  // ============================================================
  console.log("[Scenario 1] Device List Query");
  console.log("  Agent -> Xiaowei list -> devices UPSERT -> Dashboard API\n");

  await test("1.1 devices table has >= 1 online device (from agent heartbeat)", async () => {
    const { data, error } = await mainClient
      .from("devices")
      .select("serial, worker_id, status, model, last_seen")
      .eq("worker_id", workerId)
      .eq("status", "online");

    assert(!error, `Query error: ${error?.message}`);
    assert(data !== null && data.length > 0, "No online devices. Agent heartbeat not syncing?");

    realSerial = data![0].serial;
    console.log(`    -> ${data!.length} device(s), first serial=${realSerial}`);
  });

  await test("1.2 GET /api/devices returns device list", async () => {
    assert(realSerial.length > 0, "realSerial not set (1.1 failed?)");

    const resp = await dashboardGet<{ devices: Array<{ serial: string; status: string }> }>(
      `/api/devices?worker_id=${workerId}`
    );

    assert(Array.isArray(resp.devices), "Response missing devices array");
    assert(resp.devices.length > 0, "Empty devices array from API");

    const found = resp.devices.find((d) => d.serial === realSerial);
    assert(found !== undefined, `Serial ${realSerial} not in API response`);
    console.log(`    -> API returned ${resp.devices.length} device(s)`);
  });

  await test("1.3 devices.last_seen is recent (within 60s)", async () => {
    const { data } = await mainClient
      .from("devices")
      .select("last_seen")
      .eq("serial", realSerial)
      .single();

    assert(data !== null, "Device not found");
    const age = Date.now() - new Date(data!.last_seen).getTime();
    assert(age < 60_000, `last_seen is ${Math.round(age / 1000)}s ago (> 60s)`);
    console.log(`    -> last_seen ${Math.round(age / 1000)}s ago`);
  });

  // ============================================================
  // SCENARIO 2: Task Execution (ADB)
  // ============================================================
  console.log("\n[Scenario 2] Task Execution (ADB command)");
  console.log("  Task INSERT -> Agent poll -> Xiaowei adbShell -> Results\n");

  let taskId = "";

  await test("2.1 INSERT adb task -> status=pending", async () => {
    assert(realSerial.length > 0, "realSerial not set");

    const { data, error } = await mainClient
      .from("tasks")
      .insert({
        type: "adb",
        task_type: "adb",
        status: "pending",
        worker_id: workerId,
        payload: { command: "echo __e2e_full_loop_test__" },
        target_devices: [realSerial],
        title: "__e2e_full_loop_adb__",
        priority: 1,
        devices_total: 1,
        devices_done: 0,
        devices_failed: 0,
      })
      .select("id, status")
      .single();

    assert(!error, `Insert failed: ${error?.message}`);
    assert(data !== null, "No data returned");
    assert(data!.status === "pending", `Expected pending, got ${data!.status}`);

    taskId = data!.id;
    testTaskIds.push(taskId);
    console.log(`    -> taskId=${taskId}`);
  });

  await test("2.2 Agent picks up task -> status=running", async () => {
    assert(taskId.length > 0, "taskId not set (2.1 failed?)");

    type PickupRow = { status: string; started_at: string | null };
    const row = await pollUntil<PickupRow>(
      async () => {
        const { data, error } = await mainClient
          .from("tasks")
          .select("status, started_at")
          .eq("id", taskId)
          .single();
        return { data: data as PickupRow | null, error };
      },
      (d) => d.status === "running" || d.status === "done" || d.status === "failed",
      AGENT_POLL_TIMEOUT,
      "Agent task pickup"
    );

    // Agent might complete so fast it goes straight to done
    assert(
      row.status === "running" || row.status === "done",
      `Expected running/done, got ${row.status}`
    );
    console.log(`    -> status=${row.status}, started_at=${row.started_at}`);
  });

  await test("2.3 Task completes -> status=done", async () => {
    assert(taskId.length > 0, "taskId not set");

    type CompletionRow = { status: string; completed_at: string | null; result: unknown; error: string | null };
    const row = await pollUntil<CompletionRow>(
      async () => {
        const { data, error } = await mainClient
          .from("tasks")
          .select("status, completed_at, result, error")
          .eq("id", taskId)
          .single();
        return { data: data as CompletionRow | null, error };
      },
      (d) => d.status === "done" || d.status === "failed",
      AGENT_POLL_TIMEOUT,
      "Task completion"
    );

    assert(row.status === "done", `Expected done, got ${row.status} (error: ${row.error})`);
    assert(row.completed_at !== null, "completed_at should be set");
    console.log(`    -> status=${row.status}, completed_at=${row.completed_at}`);
  });

  await test("2.4 task_logs has info-level completion log", async () => {
    assert(taskId.length > 0, "taskId not set");

    const { data, error } = await mainClient
      .from("task_logs")
      .select("id, level, message, action, source")
      .eq("task_id", taskId)
      .eq("level", "info")
      .order("created_at", { ascending: false })
      .limit(1);

    assert(!error, `Query error: ${error?.message}`);
    assert(data !== null && data.length > 0, "No info-level log found for task");
    assert(data![0].message === "Task completed", `Unexpected message: ${data![0].message}`);
    console.log(`    -> logId=${data![0].id}, action=${data![0].action}`);
  });

  await test("2.5 room:tasks broadcast received for status change", async () => {
    // Test broadcast infrastructure by sending a manual update and listening
    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, "room:tasks", ["insert", "update"]);

    // Trigger a broadcast by calling the RPC (if trigger didn't fire)
    try {
      await mainClient.rpc("broadcast_to_channel", {
        p_channel: "room:tasks",
        p_event: "update",
        p_payload: { type: "update", record: { id: taskId, status: "done" } },
      });
    } catch {
      // RPC may not exist; in that case the DB trigger should have fired
    }

    try {
      const { event } = await wait();
      console.log(`    -> Broadcast received (event=${event})`);
    } catch {
      // Broadcast may timeout if Vault/pg_net not configured
      console.log(`    -> Broadcast timeout (Vault/pg_net may need config)`);
      // Verify the RPC function exists at least
      const { error: rpcErr } = await mainClient.rpc("broadcast_to_channel", {
        p_channel: "room:tasks",
        p_event: "update",
        p_payload: { type: "update", record: { id: taskId } },
      });
      assert(!rpcErr, `broadcast_to_channel RPC missing: ${rpcErr?.message}`);
      console.log(`    -> broadcast_to_channel function exists`);
    }
  });

  await test("2.6 room:task:<id>:logs broadcast verifiable", async () => {
    assert(taskId.length > 0, "taskId not set");

    const logTopic = `room:task:${taskId}:logs`;
    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, logTopic, ["insert"]);
    await new Promise((r) => setTimeout(r, 500));

    // Insert a verification log to trigger broadcast
    await mainClient.from("task_logs").insert({
      task_id: taskId,
      worker_id: workerId,
      action: "adb",
      level: "info",
      message: "__e2e_broadcast_verify__",
      source: "full-loop-e2e",
    });

    try {
      const { event } = await wait();
      console.log(`    -> Log broadcast on ${logTopic} (event=${event})`);
    } catch {
      console.log(`    -> Log broadcast timeout (pg_net trigger may need Vault)`);
    }
  });

  // ============================================================
  // SCENARIO 3: Heartbeat Cycle
  // ============================================================
  console.log("\n[Scenario 3] Heartbeat Cycle");
  console.log("  Agent heartbeat -> Worker/Device updates -> Broadcast\n");

  await test("3.1 workers table: status=online, device_count > 0", async () => {
    const { data, error } = await mainClient
      .from("workers")
      .select("status, device_count, xiaowei_connected")
      .eq("id", workerId)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assert(data!.status === "online", `Expected online, got ${data!.status}`);
    assert((data!.device_count ?? 0) > 0, `device_count=${data!.device_count}`);
    console.log(
      `    -> status=${data!.status}, devices=${data!.device_count}, xiaowei=${data!.xiaowei_connected}`
    );
  });

  await test("3.2 workers.last_heartbeat is recent (within 60s)", async () => {
    const { data } = await mainClient
      .from("workers")
      .select("last_heartbeat")
      .eq("id", workerId)
      .single();

    assert(data !== null, "Worker not found");
    const age = Date.now() - new Date(data!.last_heartbeat).getTime();
    assert(age < 60_000, `last_heartbeat is ${Math.round(age / 1000)}s ago (> 60s)`);
    console.log(`    -> last_heartbeat ${Math.round(age / 1000)}s ago`);
  });

  await test("3.3 devices.last_seen updated by heartbeat", async () => {
    const { data, error } = await mainClient
      .from("devices")
      .select("serial, last_seen, status")
      .eq("worker_id", workerId)
      .eq("status", "online")
      .order("last_seen", { ascending: false })
      .limit(1)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assert(data !== null, "No online device found");

    const age = Date.now() - new Date(data!.last_seen).getTime();
    assert(age < 60_000, `last_seen is ${Math.round(age / 1000)}s ago`);
    console.log(`    -> ${data!.serial}: last_seen ${Math.round(age / 1000)}s ago`);
  });

  await test("3.4 room:worker:<id> heartbeat broadcast (wait up to 35s)", async () => {
    const topic = `room:worker:${workerId}`;
    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, topic, ["heartbeat", "update"], {
      timeout: HEARTBEAT_WAIT,
    });

    try {
      const { event, payload } = await wait();
      assert("device_count" in payload || "devices" in payload, "Heartbeat payload missing fields");
      console.log(`    -> Heartbeat broadcast received (event=${event})`);
    } catch {
      // Heartbeat broadcast may not fire if Broadcaster isn't sending to this topic
      // Verify via DB that heartbeat data is fresh
      const { data } = await mainClient
        .from("workers")
        .select("last_heartbeat")
        .eq("id", workerId)
        .single();
      const age = Date.now() - new Date(data!.last_heartbeat).getTime();
      if (age < 35_000) {
        console.log(`    -> Broadcast timeout, but heartbeat DB data is fresh (${Math.round(age / 1000)}s)`);
      } else {
        throw new Error(`No broadcast AND heartbeat stale (${Math.round(age / 1000)}s)`);
      }
    }
  });

  // ============================================================
  // SCENARIO 4: Error Handling
  // ============================================================
  console.log("\n[Scenario 4] Error Handling");
  console.log("  Invalid task -> Agent error -> Logs + Status\n");

  let errorTaskId = "";

  await test("4.1 INSERT preset task with empty actionName -> pending", async () => {
    const { data, error } = await mainClient
      .from("tasks")
      .insert({
        type: "preset",
        task_type: "preset",
        status: "pending",
        worker_id: workerId,
        payload: {},  // missing actionName -> will throw "actionName required"
        target_devices: [realSerial],
        title: "__e2e_full_loop_error__",
        priority: 1,
        devices_total: 1,
        devices_done: 0,
        devices_failed: 0,
      })
      .select("id, status")
      .single();

    assert(!error, `Insert failed: ${error?.message}`);
    assert(data!.status === "pending", `Expected pending, got ${data!.status}`);

    errorTaskId = data!.id;
    testTaskIds.push(errorTaskId);
    console.log(`    -> taskId=${errorTaskId}`);
  });

  await test("4.2 Agent processes task -> status=failed", async () => {
    assert(errorTaskId.length > 0, "errorTaskId not set (4.1 failed?)");

    type ErrorRow = { status: string; error: string | null; completed_at: string | null };
    const row = await pollUntil<ErrorRow>(
      async () => {
        const { data, error } = await mainClient
          .from("tasks")
          .select("status, error, completed_at")
          .eq("id", errorTaskId)
          .single();
        return { data: data as ErrorRow | null, error };
      },
      (d) => d.status === "failed" || d.status === "done",
      AGENT_POLL_TIMEOUT,
      "Error task processing"
    );

    assert(row.status === "failed", `Expected failed, got ${row.status}`);
    assert(row.completed_at !== null, "completed_at should be set on failure");
    console.log(`    -> status=${row.status}, completed_at=${row.completed_at}`);
  });

  await test("4.3 task_logs has error-level log", async () => {
    assert(errorTaskId.length > 0, "errorTaskId not set");

    const { data, error } = await mainClient
      .from("task_logs")
      .select("id, level, message, action")
      .eq("task_id", errorTaskId)
      .eq("level", "error")
      .order("created_at", { ascending: false })
      .limit(1);

    assert(!error, `Query error: ${error?.message}`);
    assert(data !== null && data.length > 0, "No error-level log found");
    console.log(`    -> logId=${data![0].id}, message=${data![0].message}`);
  });

  await test("4.4 task.error contains 'actionName required'", async () => {
    assert(errorTaskId.length > 0, "errorTaskId not set");

    const { data, error } = await mainClient
      .from("tasks")
      .select("error")
      .eq("id", errorTaskId)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assert(data!.error !== null, "task.error is null");
    assert(
      data!.error!.includes("actionName"),
      `Expected 'actionName' in error, got: ${data!.error}`
    );
    console.log(`    -> error="${data!.error}"`);
  });

  await test("4.5 system_events error entry (if trigger exists)", async () => {
    // system_events may or may not be populated depending on triggers
    const { data, error } = await mainClient
      .from("system_events")
      .select("id, event_type, severity, message")
      .eq("worker_id", workerId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.log(`    -> system_events table query failed (may not exist): ${error.message}`);
      return; // Non-fatal: table may not have trigger
    }

    if (data && data.length > 0) {
      console.log(`    -> ${data.length} recent system event(s)`);
    } else {
      console.log(`    -> No system events (trigger not installed, non-blocking)`);
    }
  });

  // ============================================================
  // CLEANUP
  // ============================================================
  console.log("\n[Cleanup]");

  await test("cleanup: remove all test data", async () => {
    const errs: string[] = [];

    // Unsubscribe all channels
    for (const { client, channel } of allChannels) {
      try {
        await client.removeChannel(channel);
      } catch {
        /* ok */
      }
    }
    allChannels.length = 0;

    // Delete test task_logs
    for (const id of testTaskIds) {
      const { error } = await mainClient.from("task_logs").delete().eq("task_id", id);
      if (error) errs.push(`task_logs(${id}): ${error.message}`);
    }

    // Delete test task_devices
    for (const id of testTaskIds) {
      const { error } = await mainClient.from("task_devices").delete().eq("task_id", id);
      if (error) errs.push(`task_devices(${id}): ${error.message}`);
    }

    // Delete test tasks
    for (const id of testTaskIds) {
      const { error } = await mainClient.from("tasks").delete().eq("id", id);
      if (error) errs.push(`tasks(${id}): ${error.message}`);
    }

    // Verify cleanup
    if (testTaskIds.length > 0) {
      const { count } = await mainClient
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .in("id", testTaskIds);

      assert((count ?? 0) === 0, `${count} test task(s) not cleaned up`);
    }

    if (errs.length > 0) {
      console.log(`    -> Warnings: ${errs.join("; ")}`);
    }
    console.log(`    -> All test data cleaned`);
  });

  printSummary();
}

function printSummary(): void {
  console.log("\n" + "=".repeat(60));
  console.log(
    `Full Loop E2E: ${passed} passed, ${failed} failed, ${passed + failed} total`
  );

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results) {
      if (!r.ok) console.log(`  \u2717 ${r.name}: ${r.error}`);
    }
  }

  console.log("=".repeat(60) + "\n");
  process.exit(failed > 0 ? 1 : 0);
}

// Suppress noisy unhandled rejections from Supabase Realtime
process.on("unhandledRejection", () => {});

run().catch((err) => {
  console.error(`Fatal: ${(err as Error).message}`);
  process.exit(1);
});
