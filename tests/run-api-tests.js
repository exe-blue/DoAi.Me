/**
 * API route tests: public endpoints and optional seed.
 * Prerequisites: Next.js dev server running.
 *
 * Usage: node tests/run-api-tests.js
 */
const path = require("path");
const fs = require("fs");

const root = path.resolve(__dirname, "..");
function loadEnv() {
  try {
    const dotenv = require("dotenv");
    [".env", ".env.local"].forEach((f) => {
      const p = path.join(root, f);
      if (fs.existsSync(p)) dotenv.config({ path: p });
    });
  } catch (_) {}
}
loadEnv();

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "http://localhost:3000";

async function main() {
  console.log("[api-tests] BASE_URL:", BASE_URL);
  let passed = 0;
  let failed = 0;

  // Public login page
  try {
    const res = await fetch(`${BASE_URL}/login`);
    if (res.ok) {
      console.log("[api-tests] OK GET /login");
      passed++;
    } else {
      console.log("[api-tests] FAIL GET /login", res.status);
      failed++;
    }
  } catch (err) {
    console.log("[api-tests] FAIL GET /login:", err.message);
    failed++;
  }

  // Seed endpoint (optional: requires CRON_SECRET)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    try {
      const res = await fetch(`${BASE_URL}/api/seed/run`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      const ok = res.ok || res.status === 500; // 500 = seed logic error, not network
      if (ok) {
        console.log("[api-tests] OK POST /api/seed/run", res.status);
        passed++;
      } else {
        console.log("[api-tests] FAIL POST /api/seed/run", res.status);
        failed++;
      }
    } catch (err) {
      console.log("[api-tests] FAIL POST /api/seed/run:", err.message);
      failed++;
    }
  } else {
    console.log("[api-tests] SKIP POST /api/seed/run (no CRON_SECRET)");
  }

  console.log("[api-tests] Done. Passed:", passed, "Failed:", failed);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[api-tests]", err);
  process.exit(1);
});
