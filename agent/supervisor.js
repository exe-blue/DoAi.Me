/**
 * DoAi.Me - Agent Process Supervisor
 * Wraps agent.js as a child process with automatic restart on crash.
 * New entrypoint: `node supervisor.js`
 *
 * Features:
 * - Respawns agent on exit with 3s delay
 * - Caps restarts at 10 within 5 minutes (crash loop protection)
 * - Publishes events to Supabase Realtime on restart and crash loop
 * - Graceful shutdown: SIGTERM → child, 10s grace, SIGKILL
 */
const { fork } = require("child_process");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const MAX_RESTARTS = 10;
const RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RESTART_DELAY_MS = 3000;
const SHUTDOWN_TIMEOUT_MS = 10000;

let child = null;
let restartTimestamps = [];
let shuttingDown = false;

/**
 * Publish a system event to Supabase Realtime (room:system channel).
 * Fire-and-forget — errors are logged but do not block the supervisor.
 */
async function publishSystemEvent(type, data) {
  try {
    const { createClient } = require("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.error("[Supervisor] Cannot publish event: SUPABASE_URL or SUPABASE_ANON_KEY missing");
      return;
    }
    const supabase = createClient(url, key);
    const channel = supabase.channel("room:system");

    // Subscribe first so the channel is active, then send
    await new Promise((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
      });
    });

    await channel.send({
      type: "broadcast",
      event: "event",
      payload: { type, data, timestamp: new Date().toISOString() },
    });

    // Cleanup — unsubscribe after sending
    await supabase.removeChannel(channel);
  } catch (err) {
    console.error(`[Supervisor] Failed to publish ${type} event: ${err.message}`);
  }
}

/**
 * Prune restart timestamps older than the restart window.
 */
function pruneRestartTimestamps() {
  const cutoff = Date.now() - RESTART_WINDOW_MS;
  restartTimestamps = restartTimestamps.filter((ts) => ts > cutoff);
}

/**
 * Spawn the agent as a child process.
 */
function spawnChild() {
  const agentPath = path.join(__dirname, "agent.js");
  child = fork(agentPath, [], {
    stdio: "inherit",
    env: process.env,
  });

  console.log(`[Supervisor] Agent started (PID: ${child.pid})`);

  child.on("exit", (code, signal) => void handleChildExit(code, signal));
  child.on("error", (err) => {
    console.error(`[Supervisor] Agent process error: ${err.message}`);
  });
}

/**
 * Handle agent process exit — restart with crash loop protection.
 */
async function handleChildExit(code, signal) {
  child = null;

  if (shuttingDown) {
    console.log("[Supervisor] Agent exited during shutdown");
    return;
  }

  console.log(`[Supervisor] Agent exited (code: ${code}, signal: ${signal})`);

  // Record this restart and prune old entries
  restartTimestamps.push(Date.now());
  pruneRestartTimestamps();

  // Check crash loop threshold
  if (restartTimestamps.length >= MAX_RESTARTS) {
    console.error(
      `[Supervisor] CRITICAL: ${MAX_RESTARTS} restarts in ${RESTART_WINDOW_MS / 60000} minutes, stopping`
    );
    await publishSystemEvent("agent_crash_loop", {
      restarts: restartTimestamps.length,
      windowMinutes: RESTART_WINDOW_MS / 60000,
      lastExitCode: code,
      lastSignal: signal,
    });
    process.exit(1);
  }

  // Publish restart event (fire-and-forget)
  void publishSystemEvent("agent_restart", {
    exitCode: code,
    signal: signal,
    restartCount: restartTimestamps.length,
  });

  console.log(`[Supervisor] Restarting in ${RESTART_DELAY_MS / 1000}s...`);
  setTimeout(() => {
    if (!shuttingDown) {
      spawnChild();
    }
  }, RESTART_DELAY_MS);
}

/**
 * Graceful shutdown: send SIGTERM to child, wait, then force-kill.
 */
function gracefulShutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log("[Supervisor] Shutting down...");

  if (!child) {
    console.log("[Supervisor] No child process, exiting");
    process.exit(0);
    return;
  }

  // Send SIGTERM to child
  try {
    child.kill("SIGTERM");
    console.log("[Supervisor] Sent SIGTERM to agent");
  } catch (err) {
    console.error(`[Supervisor] Failed to send SIGTERM: ${err.message}`);
    process.exit(1);
  }

  // Force-kill after timeout
  const forceKillTimer = setTimeout(() => {
    if (child) {
      console.log("[Supervisor] Grace period expired, sending SIGKILL");
      try {
        child.kill("SIGKILL");
      } catch (err) {
        // Process may have already exited
      }
    }
    process.exit(0);
  }, SHUTDOWN_TIMEOUT_MS);

  // If child exits cleanly before timeout, clear timer and exit
  if (child) {
    child.once("exit", () => {
      clearTimeout(forceKillTimer);
      console.log("[Supervisor] Agent exited cleanly");
      process.exit(0);
    });
  }
}

// Handle termination signals
process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// Prevent supervisor from crashing on uncaught errors
process.on("uncaughtException", (err) => {
  console.error(`[Supervisor] Uncaught exception: ${err.message}`);
  console.error(err.stack);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[Supervisor] Unhandled rejection: ${reason}`);
});

// Start
console.log("[Supervisor] Starting agent supervisor");
spawnChild();
