/**
 * Supabase Sync E2E Test
 *
 * Prerequisites:
 *   - Supabase project with schema deployed
 *   - agent/.env with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npx tsx agent/src/__tests__/supabase-sync.e2e.test.ts
 */
import * as path from "path";
import * as dotenv from "dotenv";

// Load env from agent/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { SupabaseSync, TaskRow, InsertTaskDevice, InsertTaskLog } from "../supabase-sync";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WORKER_HOSTNAME = "node-pc-01";
const TEST_SERIAL = "__e2e_test_serial_001__";
const TEST_SERIAL_2 = "__e2e_test_serial_002__";

let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; error?: string }[] = [];

// IDs to clean up
let workerId = "";
let testTaskId = "";
let testTaskDeviceId = "";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
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

async function run(): Promise<void> {
  console.log(`\nSupabase Sync E2E Tests\n`);
  console.log(`  URL: ${SUPABASE_URL}`);
  console.log(`  Worker: ${WORKER_HOSTNAME}\n`);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in agent/.env");
    process.exit(1);
  }

  const sync = new SupabaseSync(SUPABASE_URL, SUPABASE_KEY);
  const adminClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // ---------- Test 1: upsertWorker ----------
  await test("1. upsertWorker() → workers 테이블에 레코드 생성/갱신", async () => {
    workerId = await sync.upsertWorker(WORKER_HOSTNAME);
    assert(typeof workerId === "string" && workerId.length > 0, "workerId is empty");

    const { data, error } = await adminClient
      .from("workers")
      .select("id, hostname, status")
      .eq("id", workerId)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assert(data !== null, "Worker not found in DB");
    assert(data!.hostname === WORKER_HOSTNAME, `hostname mismatch: ${data!.hostname}`);
    assert(data!.status === "online", `status should be online, got: ${data!.status}`);
    console.log(`    → workerId=${workerId}`);
  });

  // ---------- Test 2: syncDevices ----------
  await test("2. syncDevices(mockDeviceList) → devices 테이블에 UPSERT", async () => {
    assert(workerId.length > 0, "workerId not set (test 1 failed?)");

    const mockDevices = [
      {
        onlySerial: TEST_SERIAL,
        serial: TEST_SERIAL,
        name: "Galaxy S9 Test",
        mode: 1,
        intranetIp: "192.168.1.101",
        model: "SM-G960N",
        battery: 85,
        screenOn: true,
      },
      {
        onlySerial: TEST_SERIAL_2,
        serial: TEST_SERIAL_2,
        name: "Galaxy S9 Test 2",
        mode: 1,
        intranetIp: "192.168.1.102",
        model: "SM-G965N",
        battery: 72,
        screenOn: false,
      },
    ];

    await sync.syncDevices(mockDevices);

    const { data, error } = await adminClient
      .from("devices")
      .select("serial, worker_id, status, model, battery_level")
      .in("serial", [TEST_SERIAL, TEST_SERIAL_2]);

    assert(!error, `Query error: ${error?.message}`);
    assert(data !== null && data.length === 2, `Expected 2 devices, got ${data?.length ?? 0}`);

    const d1 = data!.find((d: Record<string, unknown>) => d.serial === TEST_SERIAL);
    assert(d1 !== undefined, "Test device 1 not found");
    assert(d1!.worker_id === workerId, "worker_id mismatch");
    assert(d1!.status === "online", `status should be online, got: ${d1!.status}`);
    assert(d1!.model === "SM-G960N", `model mismatch: ${d1!.model}`);
    console.log(`    → ${data!.length} device(s) synced`);
  });

  // ---------- Test 3: fetchPendingTasks (empty) ----------
  await test("3. fetchPendingTasks() → pending 태스크 없으면 빈 배열", async () => {
    // Clean any stale test tasks first
    await adminClient
      .from("tasks")
      .delete()
      .eq("worker_id", workerId)
      .in("status", ["pending", "assigned"]);

    const tasks = await sync.fetchPendingTasks();
    assert(Array.isArray(tasks), "Should return array");
    assert(tasks.length === 0, `Expected 0 tasks, got ${tasks.length}`);
    console.log(`    → ${tasks.length} task(s)`);
  });

  // ---------- Test 4: INSERT task → fetchPendingTasks returns 1 ----------
  await test("4. 테스트 태스크 INSERT → fetchPendingTasks() 1개 반환", async () => {
    // Insert a pending task assigned to this worker
    const { data: inserted, error: insertErr } = await adminClient
      .from("tasks")
      .insert({
        type: "preset" as const,
        status: "pending" as const,
        worker_id: workerId,
        payload: { actionName: "e2e_test_action" },
        title: "__e2e_test_task__",
        priority: 1,
        devices_total: 2,
        devices_done: 0,
        devices_failed: 0,
      })
      .select("id")
      .single();

    assert(!insertErr, `Task insert failed: ${insertErr?.message}`);
    assert(inserted !== null, "No task returned after insert");
    testTaskId = inserted!.id;

    const tasks = await sync.fetchPendingTasks();
    assert(tasks.length >= 1, `Expected ≥1 task, got ${tasks.length}`);

    const found = tasks.find((t: TaskRow) => t.id === testTaskId);
    assert(found !== undefined, `Test task ${testTaskId} not in fetched results`);
    console.log(`    → taskId=${testTaskId}, fetched ${tasks.length} task(s)`);
  });

  // ---------- Test 5: updateTaskStatus → running ----------
  await test("5. updateTaskStatus(id, 'running') → status 확인", async () => {
    assert(testTaskId.length > 0, "testTaskId not set (test 4 failed?)");

    await sync.updateTaskStatus(testTaskId, "running");

    const { data, error } = await adminClient
      .from("tasks")
      .select("status, started_at")
      .eq("id", testTaskId)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assert(data!.status === "running", `Expected running, got: ${data!.status}`);
    assert(data!.started_at !== null, "started_at should be set");
    console.log(`    → status=${data!.status}, started_at=${data!.started_at}`);
  });

  // ---------- Test 6: insertTaskDevice ----------
  await test("6. insertTaskDevice() → task_devices 레코드 생성", async () => {
    assert(testTaskId.length > 0, "testTaskId not set");

    const params: InsertTaskDevice = {
      task_id: testTaskId,
      device_serial: TEST_SERIAL,
      worker_id: workerId,
      status: "done",
    };

    testTaskDeviceId = (await sync.insertTaskDevice(params)) ?? "";
    assert(testTaskDeviceId.length > 0, "insertTaskDevice returned null");

    const { data, error } = await adminClient
      .from("task_devices")
      .select("id, task_id, device_serial, status, started_at")
      .eq("id", testTaskDeviceId)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assert(data!.task_id === testTaskId, "task_id mismatch");
    assert(data!.device_serial === TEST_SERIAL, "device_serial mismatch");
    assert(data!.status === "done", `status should be done, got: ${data!.status}`);
    assert(data!.started_at !== null, "started_at should be set");
    console.log(`    → taskDeviceId=${testTaskDeviceId}`);
  });

  // ---------- Test 7: insertTaskLog ----------
  await test("7. insertTaskLog() → task_logs 레코드 생성", async () => {
    assert(testTaskId.length > 0, "testTaskId not set");

    const logParams: InsertTaskLog = {
      task_id: testTaskId,
      worker_id: workerId,
      action: "preset",
      level: "info",
      message: "E2E test log entry",
      request: { actionName: "e2e_test_action" },
      response: { code: 10000, msg: "success" },
      source: "e2e-test",
    };

    await sync.insertTaskLog(logParams);

    const { data, error } = await adminClient
      .from("task_logs")
      .select("id, task_id, worker_id, action, level, message, source")
      .eq("task_id", testTaskId)
      .eq("source", "e2e-test")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    assert(!error, `Query error: ${error?.message}`);
    assert(data!.task_id === testTaskId, "task_id mismatch");
    assert(data!.worker_id === workerId, "worker_id mismatch");
    assert(data!.level === "info", `level should be info, got: ${data!.level}`);
    assert(data!.action === "preset", `action should be preset, got: ${data!.action}`);
    assert(data!.message === "E2E test log entry", `message mismatch: ${data!.message}`);
    console.log(`    → logId=${data!.id}`);
  });

  // ---------- Test 8: fn_sync_task_progress trigger ----------
  await test("8. fn_sync_task_progress 트리거 → devices_done 자동 증가", async () => {
    assert(testTaskId.length > 0, "testTaskId not set");

    // Clean slate: remove all task_devices for this task
    await adminClient.from("task_devices").delete().eq("task_id", testTaskId);

    // Reset counters
    await adminClient
      .from("tasks")
      .update({ devices_done: 0, devices_failed: 0 })
      .eq("id", testTaskId);

    // Step 1: Insert first task_device with status='done'
    const td1Id = await sync.insertTaskDevice({
      task_id: testTaskId,
      device_serial: TEST_SERIAL,
      worker_id: workerId,
      status: "done",
    });
    assert(td1Id !== null, "First insertTaskDevice returned null");

    // Wait for trigger
    await new Promise((resolve) => setTimeout(resolve, 300));

    const { data: after1, error: err1 } = await adminClient
      .from("tasks")
      .select("devices_done, devices_failed")
      .eq("id", testTaskId)
      .single();

    assert(!err1, `Query error: ${err1?.message}`);
    assert(
      after1!.devices_done === 1,
      `After 1st insert: expected devices_done=1, got ${after1!.devices_done} (트리거 미적용? supabase/migrations/00005_fn_sync_task_progress.sql 실행 필요)`
    );
    console.log(`    → 1st insert: devices_done=${after1!.devices_done}`);

    // Step 2: Insert second task_device with status='done'
    const td2Id = await sync.insertTaskDevice({
      task_id: testTaskId,
      device_serial: TEST_SERIAL_2,
      worker_id: workerId,
      status: "done",
    });
    assert(td2Id !== null, "Second insertTaskDevice returned null");

    // Wait for trigger
    await new Promise((resolve) => setTimeout(resolve, 300));

    const { data: after2, error: err2 } = await adminClient
      .from("tasks")
      .select("devices_done, devices_failed")
      .eq("id", testTaskId)
      .single();

    assert(!err2, `Query error: ${err2?.message}`);
    assert(
      after2!.devices_done === 2,
      `After 2nd insert: expected devices_done=2, got ${after2!.devices_done}`
    );
    console.log(`    → 2nd insert: devices_done=${after2!.devices_done} (trigger active ✓)`);
  });

  // ---------- Test 9: Teardown ----------
  await test("9. 테스트 데이터 정리 (teardown)", async () => {
    const errors: string[] = [];

    // Delete task_logs for test task
    if (testTaskId) {
      const { error: logErr } = await adminClient
        .from("task_logs")
        .delete()
        .eq("task_id", testTaskId);
      if (logErr) errors.push(`task_logs: ${logErr.message}`);
    }

    // Delete task_devices for test task
    if (testTaskId) {
      const { error: tdErr } = await adminClient
        .from("task_devices")
        .delete()
        .eq("task_id", testTaskId);
      if (tdErr) errors.push(`task_devices: ${tdErr.message}`);
    }

    // Delete test task
    if (testTaskId) {
      const { error: taskErr } = await adminClient
        .from("tasks")
        .delete()
        .eq("id", testTaskId);
      if (taskErr) errors.push(`tasks: ${taskErr.message}`);
    }

    // Delete test devices
    {
      const { error: devErr } = await adminClient
        .from("devices")
        .delete()
        .in("serial", [TEST_SERIAL, TEST_SERIAL_2]);
      if (devErr) errors.push(`devices: ${devErr.message}`);
    }

    // Verify cleanup
    const { count: taskCount } = await adminClient
      .from("tasks")
      .select("*", { count: "exact", head: true })
      .eq("id", testTaskId);

    const { count: deviceCount } = await adminClient
      .from("devices")
      .select("*", { count: "exact", head: true })
      .in("serial", [TEST_SERIAL, TEST_SERIAL_2]);

    assert(errors.length === 0, `Cleanup errors: ${errors.join("; ")}`);
    assert((taskCount ?? 0) === 0, `Test task not cleaned up, count=${taskCount}`);
    assert((deviceCount ?? 0) === 0, `Test devices not cleaned up, count=${deviceCount}`);
    console.log(`    → All test data cleaned`);
  });

  // We don't delete the worker as it may be shared / pre-existing
  // Just set it offline
  await sync.setWorkerOffline();
  await sync.unsubscribeAll();

  printSummary();
}

function printSummary(): void {
  console.log("\n" + "=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results) {
      if (!r.ok) console.log(`  ✗ ${r.name}: ${r.error}`);
    }
  }

  console.log("=".repeat(50) + "\n");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(`Test runner error: ${(err as Error).message}`);
  process.exit(1);
});
