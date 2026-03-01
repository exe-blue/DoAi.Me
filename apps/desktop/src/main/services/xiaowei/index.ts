/**
 * Xiaowei WebSocket client: connect with timeout. Full command API can be added in Phase B/C.
 * Uses "ws" so the main process works on Linux/Node where global WebSocket may be undefined.
 */
import Ws from "ws";

let ws: Ws | null = null;

const OPEN = 1 as const;

export function connectXiaowei(wsUrl: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws?.readyState === OPEN) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      ws?.close();
      ws = null;
      reject(new Error(`Xiaowei did not connect within ${timeoutMs / 1000}s`));
    }, timeoutMs);
    ws = new Ws(wsUrl);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on("error", (ev: Error) => {
      clearTimeout(timer);
      reject(new Error(ev.message || "WebSocket error"));
    });
    ws.on("close", () => {
      ws = null;
    });
  });
}

export function disconnectXiaowei(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
}

export function isXiaoweiConnected(): boolean {
  return ws?.readyState === OPEN;
}
