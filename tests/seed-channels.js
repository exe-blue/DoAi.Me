/**
 * Seed channels (and related data) for E2E via API.
 * Requires: dev server running, CRON_SECRET in .env.local (or env).
 *
 * Usage: node tests/seed-channels.js
 *   Or: curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/seed/run
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
const CRON_SECRET = process.env.CRON_SECRET;

async function main() {
  if (!CRON_SECRET) {
    console.log("CRON_SECRET not set. Set it in .env.local and run:");
    console.log('  curl -X POST -H "Authorization: Bearer $CRON_SECRET"', BASE_URL + "/api/seed/run");
    process.exit(1);
  }

  const res = await fetch(`${BASE_URL}/api/seed/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("Seed failed:", res.status, body);
    process.exit(1);
  }

  console.log("Seed OK:", body);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
