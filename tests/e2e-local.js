/**
 * E2E pipeline test: dashboard reachable, login page, optional API.
 * Prerequisites: Next.js dev server running (e.g. pnpm run dev from apps/web or root).
 * Optional: .env.local with NEXT_PUBLIC_SUPABASE_* for full flow.
 *
 * Usage: node tests/e2e-local.js [--no-cleanup]
 *   --no-cleanup  Skip cleanup step (no-op in this script; for future use)
 */
const path = require("path");
const fs = require("fs");

// Load env: repo root .env and .env.local (merge)
const root = path.resolve(__dirname, "..");
function loadEnv() {
  try {
    const dotenv = require("dotenv");
    const envPath = path.join(root, ".env");
    const envLocalPath = path.join(root, ".env.local");
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath });
    if (fs.existsSync(envLocalPath)) dotenv.config({ path: envLocalPath });
  } catch (_) {
    // dotenv optional
  }
}
loadEnv();

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
  "http://localhost:3000";

async function fetchOk(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? require("https") : require("http");
    const req = lib.get(url, { timeout: 10000 }, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  console.log("[e2e-local] BASE_URL:", BASE_URL);
  let passed = 0;
  let failed = 0;

  // 1. Root or login page (dashboard may redirect to /login)
  try {
    const ok = await fetchOk(BASE_URL) || await fetchOk(`${BASE_URL}/login`);
    if (ok) {
      console.log("[e2e-local] OK / or /login reachable");
      passed++;
    } else {
      console.log("[e2e-local] FAIL / or /login not 2xx");
      failed++;
    }
  } catch (err) {
    console.log("[e2e-local] FAIL fetch /:", err.message);
    failed++;
  }

  // 2. Login page explicitly
  try {
    const ok = await fetchOk(`${BASE_URL}/login`);
    if (ok) {
      console.log("[e2e-local] OK /login reachable");
      passed++;
    } else {
      console.log("[e2e-local] FAIL /login not 2xx");
      failed++;
    }
  } catch (err) {
    console.log("[e2e-local] FAIL fetch /login:", err.message);
    failed++;
  }

  if (failed > 0) {
    console.log("[e2e-local] Ensure dev server is running: pnpm run dev (from repo root or apps/web)");
    process.exit(1);
  }

  console.log("[e2e-local] Done. Passed:", passed, "Failed:", failed);
  process.exit(0);
}

main().catch((err) => {
  console.error("[e2e-local]", err);
  process.exit(1);
});
