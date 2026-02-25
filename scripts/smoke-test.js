/**
 * DoAi.Me E2E Smoke Test
 * Creates a simple ADB task, waits for agent to run it, verifies completion in < 30s.
 *
 * Usage (from repo root):
 *   node scripts/smoke-test.js
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (from .env.local or agent/.env).
 * Optional: BASE_URL (default http://localhost:3000) for health check only.
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
require("dotenv").config({ path: path.resolve(__dirname, "../agent/.env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 30000;

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set in .env.local or agent/.env");
    process.exit(1);
  }

  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const taskId = require("crypto").randomUUID();
  const startedAt = Date.now();

  console.log("[SmokeTest] Creating simple ADB task...");
  const insert = {
    id: taskId,
    type: "adb",
    task_type: "adb_shell",
    status: "pending",
    payload: { command: "echo ok" },
  };
  const { error: insertError } = await supabase.from("tasks").insert(insert);
  if (insertError) {
    console.error("[SmokeTest] Failed to insert task:", insertError.message);
    process.exit(1);
  }
  console.log("[SmokeTest] Task created:", taskId);

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const { data: row, error } = await supabase
      .from("tasks")
      .select("id, status, started_at, completed_at, error")
      .eq("id", taskId)
      .maybeSingle();
    if (error) {
      console.error("[SmokeTest] Poll error:", error.message);
      continue;
    }
    if (!row) {
      console.warn("[SmokeTest] Task not found");
      continue;
    }
    if (row.status === "running") {
      console.log("[SmokeTest] Task running...");
      continue;
    }
    if (row.status === "completed") {
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[SmokeTest] PASS: task completed in ${elapsed}s`);
      process.exit(0);
    }
    if (row.status === "failed") {
      console.error("[SmokeTest] FAIL: task failed:", row.error || "unknown");
      process.exit(1);
    }
  }

  console.error("[SmokeTest] FAIL: timeout waiting for task (30s)");
  process.exit(1);
}

main().catch((err) => {
  console.error("[SmokeTest]", err);
  process.exit(1);
});
