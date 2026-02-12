/**
 * DoAi.Me Node PC Agent
 * Supabase Realtime ↔ Xiaowei WebSocket 브릿지
 */
const config = require("./config");

console.log(`[Agent] Starting worker: ${config.workerName}`);

// TODO: Phase 1 구현
// - Supabase Realtime 구독 (tasks)
// - Xiaowei WebSocket 연결
// - Heartbeat (30초 주기)
// - Task 실행

process.on("SIGINT", () => {
  console.log("\n[Agent] Shutting down...");
  process.exit(0);
});
