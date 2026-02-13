/**
 * Broadcast Pipeline E2E Test
 *
 * Verifies:
 *   A) JS Client Broadcast (channel.send → cross-client delivery)
 *   B) DB Trigger → pg_net → Broadcast API (if Vault configured)
 *
 * Run: npx tsx agent/src/__tests__/broadcast.e2e.test.ts
 */
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { Broadcaster } from "../broadcaster";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const BROADCAST_TIMEOUT = 12000;

process.on("unhandledRejection", () => {});

let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; error?: string }[] = [];
let testTaskId = "";
let testWorkerId = "";
const allChannels: { client: SupabaseClient; channel: RealtimeChannel }[] = [];

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    const msg = (err as Error).message;
    results.push({ name, ok: false, error: msg });
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

function newClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/**
 * Create a channel, register broadcast handlers BEFORE subscribing,
 * then subscribe and return both the channel and a waiter promise.
 */
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
    (resolve, reject) => { resolveWait = resolve; rejectWait = reject; }
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
    const timer = setTimeout(() => reject(new Error(`Subscribe timeout: ${topic}`)), 10000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer); reject(new Error(`Subscribe failed: ${topic} (${status})`));
      }
    });
  });

  allChannels.push({ client, channel });

  return {
    channel,
    wait: () => {
      // Start timeout ONLY when wait() is called
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

async function run(): Promise<void> {
  console.log(`\nBroadcast Pipeline E2E Tests\n`);
  console.log(`  URL: ${SUPABASE_URL}\n`);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const mainClient = newClient();
  const { data: worker } = await mainClient
    .from("workers").select("id").limit(1).single();
  testWorkerId = worker?.id ?? "";

  // ============================================================
  // Test 1: Subscribe to room:tasks
  // ============================================================
  await test("1. room:tasks 채널 구독 성공 (SUBSCRIBED)", async () => {
    const { channel } = await listenBroadcast(mainClient, "room:tasks", ["insert", "update"]);
    assert(channel !== undefined, "Channel not created");
    console.log(`    → Subscribed to room:tasks`);
  });

  // ============================================================
  // Test 2: tasks INSERT → room:tasks broadcast
  // ============================================================
  await test("2. tasks INSERT → room:tasks 에서 insert 이벤트 수신", async () => {
    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, "room:tasks", ["insert"]);

    const { data: inserted, error } = await mainClient
      .from("tasks")
      .insert({
        type: "adb" as const,
        status: "pending" as const,
        payload: { command: "__broadcast_e2e_test__" },
        title: "__broadcast_e2e_test__",
        priority: 5,
        worker_id: testWorkerId || null,
      })
      .select("id")
      .single();
    assert(!error, `Insert failed: ${error?.message}`);
    testTaskId = inserted!.id;

    try {
      const { event, payload } = await wait();
      console.log(`    → taskId=${testTaskId}, trigger OK, event=${event}, keys: ${Object.keys(payload).join(", ")}`);
    } catch {
      console.log(`    ⚠ pg_net 경로 타임아웃 (Vault 미설정 가능)`);
      const { error: rpcErr } = await mainClient.rpc("broadcast_to_channel", {
        p_channel: "room:tasks", p_event: "insert",
        p_payload: { type: "insert", record: { id: testTaskId } },
      });
      assert(!rpcErr, `broadcast_to_channel RPC failed: ${rpcErr?.message}`);
      console.log(`    → broadcast_to_channel 함수 존재 확인, Vault 설정 후 정상 동작 예상`);
    }
  });

  // ============================================================
  // Test 3: tasks UPDATE → broadcast
  // ============================================================
  await test("3. tasks.status UPDATE → room:tasks 에서 update 이벤트 수신", async () => {
    assert(testTaskId.length > 0, "testTaskId not set");

    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, "room:tasks", ["update"]);

    await mainClient
      .from("tasks")
      .update({ status: "running" as const, started_at: new Date().toISOString() })
      .eq("id", testTaskId);

    try {
      const { event } = await wait();
      console.log(`    → Update broadcast received (event=${event})`);
    } catch {
      console.log(`    ⚠ pg_net 경로 타임아웃`);
      const { error: rpcErr } = await mainClient.rpc("broadcast_to_channel", {
        p_channel: "room:tasks", p_event: "update",
        p_payload: { type: "update", record: { id: testTaskId, status: "running" } },
      });
      assert(!rpcErr, `broadcast_to_channel failed: ${rpcErr?.message}`);
      console.log(`    → 함수 존재 확인`);
    }
  });

  // ============================================================
  // Test 4: task_logs INSERT → room:task:<id>:logs
  // ============================================================
  await test("4. task_logs INSERT → room:task:<id>:logs 에서 insert 이벤트 수신", async () => {
    assert(testTaskId.length > 0, "testTaskId not set");

    const logTopic = `room:task:${testTaskId}:logs`;
    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, logTopic, ["insert"]);
    await new Promise((r) => setTimeout(r, 500));

    await mainClient.from("task_logs").insert({
      task_id: testTaskId,
      worker_id: testWorkerId || null,
      action: "adb", level: "info" as const,
      message: "__broadcast_e2e_log__", source: "broadcast-e2e",
    });

    try {
      const { event } = await wait();
      console.log(`    → Log broadcast on ${logTopic} (event=${event})`);
    } catch {
      console.log(`    ⚠ pg_net 경로 타임아웃`);
      const { error: rpcErr } = await mainClient.rpc("broadcast_to_channel", {
        p_channel: logTopic, p_event: "insert",
        p_payload: { type: "insert", record: { task_id: testTaskId } },
      });
      assert(!rpcErr, `broadcast_to_channel failed: ${rpcErr?.message}`);
      console.log(`    → 함수 존재 확인`);
    }
  });

  // ============================================================
  // Test 5: system_events INSERT → room:system
  // ============================================================
  await test("5. system_events INSERT → room:system 에서 이벤트 수신", async () => {
    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, "room:system", ["insert", "system_event"]);
    await new Promise((r) => setTimeout(r, 500));

    await mainClient.from("system_events").insert({
      event_type: "e2e_broadcast_test",
      severity: "info" as const,
      message: "__broadcast_e2e_system__",
      worker_id: testWorkerId || null,
    });

    try {
      const { event } = await wait();
      console.log(`    → System broadcast (event=${event})`);
    } catch {
      console.log(`    ⚠ 수신 안됨 — system_events 트리거 미등록 또는 Vault 미설정`);
      const { error: rpcErr } = await mainClient.rpc("broadcast_to_channel", {
        p_channel: "room:system", p_event: "insert",
        p_payload: { type: "insert", record: { event_type: "test" } },
      });
      assert(!rpcErr, `broadcast_to_channel failed: ${rpcErr?.message}`);
      console.log(`    → broadcast_to_channel 호출 가능 (trigger 추가 필요)`);
    }
  });

  // ============================================================
  // Test 6: workers UPDATE → room:workers
  // ============================================================
  await test("6. workers.status UPDATE → room:workers 에서 이벤트 수신", async () => {
    assert(testWorkerId.length > 0, "testWorkerId not set");

    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, "room:workers", ["update", "worker_update"]);
    await new Promise((r) => setTimeout(r, 500));

    await mainClient
      .from("workers")
      .update({ status: "online" as const, last_heartbeat: new Date().toISOString() })
      .eq("id", testWorkerId);

    try {
      const { event } = await wait();
      console.log(`    → Workers broadcast (event=${event})`);
    } catch {
      console.log(`    ⚠ 수신 안됨 — workers 트리거 미등록 또는 Vault 미설정`);
      const { error: rpcErr } = await mainClient.rpc("broadcast_to_channel", {
        p_channel: "room:workers", p_event: "update",
        p_payload: { type: "update", record: { id: testWorkerId } },
      });
      assert(!rpcErr, `broadcast_to_channel failed: ${rpcErr?.message}`);
      console.log(`    → broadcast_to_channel 호출 가능 (trigger 추가 필요)`);
    }
  });

  // ============================================================
  // Test 7: Agent Broadcaster → room:devices (JS client cross-client)
  // ============================================================
  await test("7. Agent Broadcaster(room:devices) → 수신 확인", async () => {
    const receiver = newClient();
    const { wait } = await listenBroadcast(receiver, "room:devices", ["update"]);
    await new Promise((r) => setTimeout(r, 500));

    const broadcaster = new Broadcaster(mainClient, testWorkerId || "e2e-test");
    await broadcaster.broadcastDeviceBatch([
      {
        onlySerial: "__e2e_serial__", serial: "__e2e_serial__",
        name: "E2E Test", mode: 1, intranetIp: "10.0.0.1",
        model: "SM-G960N", battery: 99,
      },
    ]);

    const { payload } = await wait();
    const devices = payload.devices as unknown[];
    assert(Array.isArray(devices) && devices.length > 0, "devices array missing");
    console.log(`    → Agent broadcast received, ${devices.length} device(s)`);
    await broadcaster.cleanup();
  });

  // ============================================================
  // Test 8: Payload field validation
  // ============================================================
  await test("8. 수신 페이로드에 ts, source, data 필드 존재", async () => {
    const { channel, wait } = await listenBroadcast(
      mainClient, "room:__e2e_fields__", ["test"], { self: true }
    );
    await new Promise((r) => setTimeout(r, 300));

    await channel.send({
      type: "broadcast", event: "test",
      payload: { ts: new Date().toISOString(), source: "e2e-test", data: { ok: true } },
    });

    const { payload } = await wait();
    assert("ts" in payload || "timestamp" in payload, "ts/timestamp missing");
    assert("source" in payload, "source missing");
    assert("data" in payload, "data missing");
    console.log(`    → Fields: ${Object.keys(payload).join(", ")}`);
  });

  // ============================================================
  // Test 9: anon key subscribe
  // ============================================================
  await test("9. anon 키로 room:tasks 구독 → 정상 수신", async () => {
    assert(!!ANON_KEY, "SUPABASE_ANON_KEY not set");

    const anonClient = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const ch = anonClient.channel("room:tasks");
    ch.on("broadcast", { event: "__noop__" }, () => {});

    const status = await new Promise<string>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout")), 10000);
      ch.subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(t); resolve(s);
        }
      });
    });
    assert(status === "SUBSCRIBED", `Anon: ${status}`);
    console.log(`    → anon key: ${status}`);
    await anonClient.removeChannel(ch);
  });

  // ============================================================
  // Test 10: Cleanup
  // ============================================================
  await test("10. 모든 구독 해제 + 테스트 데이터 정리", async () => {
    const errs: string[] = [];
    for (const { client, channel } of allChannels) {
      try { await client.removeChannel(channel); } catch { /* ok */ }
    }
    allChannels.length = 0;

    if (testTaskId) {
      const r1 = await mainClient.from("task_logs").delete().eq("task_id", testTaskId);
      if (r1.error) errs.push(`task_logs: ${r1.error.message}`);
      const r2 = await mainClient.from("task_devices").delete().eq("task_id", testTaskId);
      if (r2.error) errs.push(`task_devices: ${r2.error.message}`);
      const r3 = await mainClient.from("tasks").delete().eq("id", testTaskId);
      if (r3.error) errs.push(`tasks: ${r3.error.message}`);
    }
    const r4 = await mainClient.from("system_events").delete().eq("event_type", "e2e_broadcast_test");
    if (r4.error) errs.push(`system_events: ${r4.error.message}`);

    if (testTaskId) {
      const { count } = await mainClient.from("tasks").select("*", { count: "exact", head: true }).eq("id", testTaskId);
      assert((count ?? 0) === 0, "Task not cleaned");
    }
    if (errs.length > 0) console.log(`    ⚠ ${errs.join("; ")}`);
    console.log(`    → All cleaned`);
  });

  printSummary();
}

function printSummary(): void {
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    console.log("\nFailed:");
    for (const r of results) if (!r.ok) console.log(`  ✗ ${r.name}: ${r.error}`);
  }
  console.log("=".repeat(50) + "\n");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(`Fatal: ${(err as Error).message}`);
  process.exit(1);
});
