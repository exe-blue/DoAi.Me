/**
 * Xiaowei WebSocket E2E Test
 *
 * Prerequisites:
 *   - Xiaowei running on ws://127.0.0.1:22222/
 *   - At least 1 Galaxy S9 connected via USB
 *
 * Run: npx tsx agent/src/__tests__/xiaowei.e2e.test.ts
 */
import { XiaoweiClient, XiaoweiDevice } from "../xiaowei-client";

const WS_URL = process.env.XIAOWEI_WS_URL || "ws://127.0.0.1:22222/";
const TIMEOUT = 15000;

let passed = 0;
let failed = 0;
const results: { name: string; ok: boolean; error?: string }[] = [];

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

function waitForEvent(
  client: XiaoweiClient,
  event: string,
  timeoutMs = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeoutMs);
    client.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function run(): Promise<void> {
  console.log(`\nXiaowei E2E Tests — ${WS_URL}\n`);

  // ---------- Test 1: WebSocket 연결 ----------
  const client = new XiaoweiClient(WS_URL);

  await test("1. WebSocket 연결 성공", async () => {
    const connected = waitForEvent(client, "connected", TIMEOUT);
    client.connect();
    await connected;
    assert(client.connected, "client.connected should be true");
  });

  if (!client.connected) {
    console.log("\n  ⚠ Xiaowei에 연결할 수 없습니다. 나머지 테스트를 건너뜁니다.");
    client.disconnect();
    printSummary();
    return;
  }

  // ---------- Test 2: list API → 디바이스 1대 이상 ----------
  let devices: XiaoweiDevice[] = [];

  await test("2. list API → 디바이스 1대 이상 응답", async () => {
    devices = await client.list();
    assert(devices.length > 0, `Expected ≥1 device, got ${devices.length}`);
    console.log(`    → ${devices.length} device(s) found`);
  });

  // ---------- Test 3: 응답 필드 검증 ----------
  await test("3. 디바이스 필드 (onlySerial, serial, name, mode, intranetIp) 존재", async () => {
    assert(devices.length > 0, "No devices to check");
    const d = devices[0];
    assert(typeof d.onlySerial === "string" && d.onlySerial.length > 0, "onlySerial missing");
    assert(typeof d.serial === "string" && d.serial.length > 0, "serial missing");
    assert(typeof d.name === "string", "name missing");
    assert(typeof d.mode === "number", "mode missing");
    assert(typeof d.intranetIp === "string", "intranetIp missing");
    console.log(`    → serial=${d.serial}, name=${d.name}, ip=${d.intranetIp}`);
  });

  // ---------- Test 4: screen API → base64 이미지 ----------
  await test("4. screen API → base64 이미지 데이터 수신", async () => {
    assert(devices.length > 0, "No devices");
    const serial = devices[0].serial;
    const resp = await client.screen(serial);
    // Response may contain base64 data in different fields
    const raw = JSON.stringify(resp);
    // Base64 images typically have long strings with + / = characters
    const hasBase64 = raw.length > 500 || /[A-Za-z0-9+/=]{100,}/.test(raw);
    assert(hasBase64, "Response doesn't contain base64 image data");
    console.log(`    → Received ${raw.length} chars`);
  });

  // ---------- Test 5: adb_shell → SM-G96 응답 ----------
  await test("5. adbShell(getprop ro.product.model) → SM-G96 포함", async () => {
    assert(devices.length > 0, "No devices");
    const serial = devices[0].serial;
    const resp = await client.adbShell(serial, "getprop ro.product.model");
    const raw = JSON.stringify(resp);
    assert(raw.includes("SM-G96"), `Expected SM-G96 in response, got: ${raw.substring(0, 200)}`);
    console.log(`    → Model found in response`);
  });

  // ---------- Test 6: 자동 재연결 ----------
  await test("6. 연결 끊김 시 3초 내 자동 재연결", async () => {
    // Force close the underlying ws
    const ws = (client as unknown as { ws: { close: () => void } }).ws;
    assert(ws != null, "Cannot access internal WebSocket");

    const reconnected = waitForEvent(client, "connected", 5000);
    ws.close();

    // Wait for disconnected event first
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 500);
      client.once("disconnected", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const start = Date.now();
    await reconnected;
    const elapsed = Date.now() - start;
    assert(elapsed < 3000, `Reconnection took ${elapsed}ms (>3s)`);
    console.log(`    → Reconnected in ${elapsed}ms`);
  });

  // Cleanup
  client.disconnect();

  // ---------- Test 7: Xiaowei 미실행 시 graceful 에러 ----------
  await test("7. Xiaowei 미실행 시 graceful 에러 처리 (크래시 없음)", async () => {
    const badClient = new XiaoweiClient("ws://127.0.0.1:19999/");
    let errorCaught = false;

    badClient.on("error", () => {
      errorCaught = true;
    });

    badClient.connect();

    // Wait a bit for the connection attempt to fail
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Should not crash; disconnect cleanly
    badClient.disconnect();
    console.log(`    → No crash, error event: ${errorCaught}`);
  });

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
