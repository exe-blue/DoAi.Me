#!/usr/bin/env node
/**
 * UltraQA API 테스트 실행기
 * 사용법: npm run dev 실행 후 다른 터미널에서 npm run test:api
 */
const BASE = process.env.API_BASE || "http://localhost:3000";

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (e) {
    console.error(`  ✗ ${name}:`, e.message);
    return false;
  }
}

async function main() {
  console.log(`\nUltraQA API Tests (${BASE})\n`);
  let passed = 0;
  let failed = 0;

  const ok = await test("GET /api/health", async () => {
    const r = await fetch(`${BASE}/api/health`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (j.status !== "ok") throw new Error(`Expected status: ok, got: ${j.status}`);
  });
  ok ? passed++ : failed++;

  // Phase 2+ APIs will be added as they're implemented
  // await test("GET /api/channels", async () => { ... });

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
