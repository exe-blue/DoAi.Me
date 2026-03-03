/**
 * Runs and monitors the embedded Node agent.
 * SSOT: Desktop runs ONLY apps/desktop/src/agent. Root agent/ must NEVER be used as execution path.
 * - Dev: <repoRoot>/apps/desktop/src/agent/agent.js (app.getAppPath() = apps/desktop), system "node".
 * - Dist: <process.resourcesPath>/agent/agent.bundle.cjs (extraResources copies agent-dist → resources/agent), cwd=resources for .env, bundled node.exe.
 * No fallback to root agent/. Stdout/stderr → userData/logs/agent.stdout.log, agent.stderr.log. Restart backoff 2s→5s→10s, max 5 retries.
 */

import { app, BrowserWindow } from "electron";
import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import log from "electron-log";

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const MAX_RESTARTS = 5;
const BACKOFF_MS = [2000, 5000, 10000];
const AGENT_LOG_DIR = "logs";
const AGENT_STDOUT = "agent.stdout.log";
const AGENT_STDERR = "agent.stderr.log";
const EXIT_TAIL_LINES = 50;
const EXIT_TAIL_LINES_SHORT = 20;
const EXIT_TAIL_MAX_CHARS = 4000;

export type AgentStatus = "RUNNING" | "STOPPED" | "RESTARTING" | "ERROR";

export interface AgentState {
  status: AgentStatus;
  lastExitCode: number | null;
  lastErrorLine: string;
  restartCount: number;
  /** Current Agent PC number (from agent-pc-status.json), e.g. "PC-02", "PC-01". */
  pc_number?: string | null;
  /** Effective WebSocket URL the agent uses (from status file or main env). */
  wsEffectiveUrl?: string;
  /** CONNECTING | CONNECTED | FAILED */
  wsStatus?: string;
  /** Last WS failure reason (one line). */
  wsLastFailure?: string;
  /** Current connection attempt number (from status file). */
  wsAttemptNo?: number;
  /** Failure category for UI: TCP_REFUSED | HTTP_4XX | TIMEOUT | OTHER */
  wsFailureCategory?: string;
  /** Last connect elapsed ms (success or failure). */
  wsElapsedMs?: number;
  /** WebSocket close code (when status is FAILED). */
  wsCloseCode?: number;
  /** WebSocket close reason string. */
  wsCloseReason?: string;
  /** Optional WS API URL. Set by main, not agent. */
  xiaoweiWsUrl?: string;
  /** "disabled" | "unavailable" | "enabled". Set by main, not agent. */
  xiaoweiWSApiStatus?: "disabled" | "unavailable" | "enabled";
}

let child: ChildProcess | null = null;
let state: AgentState = {
  status: "STOPPED",
  lastExitCode: null,
  lastErrorLine: "",
  restartCount: 0,
};
let restartTimer: ReturnType<typeof setTimeout> | null = null;
let stdoutStream: fs.WriteStream | null = null;
let stderrStream: fs.WriteStream | null = null;
let xiaoweiReadyCheck: (() => boolean) | null = null;
/** Last env overrides passed from main; used on restart. */
let lastEnvOverrides: Record<string, string> | undefined = undefined;

/** Register a callback that returns true when Xiaowei is reachable. */
export function setXiaoweiReadyCheck(fn: () => boolean): void {
  xiaoweiReadyCheck = fn;
}

function getLogDir(): string {
  return path.join(app.getPath("userData"), AGENT_LOG_DIR);
}

function getAgentPaths(): { node: string; script: string; cwd: string } | null {
  try {
    if (isDev) {
      const repoRoot = app.getAppPath();
      const script = path.join(repoRoot, "src", "agent", "agent.js");
      const cwd = path.join(repoRoot, "src", "agent");
      const scriptExists = fs.existsSync(script);
      log.info("[AgentRunner] Dev nodePath=node script=%s cwd=%s scriptExists=%s", script, cwd, scriptExists);
      if (!scriptExists) {
        log.error("[AgentRunner] Dev: agent.js not found at", script);
        return null;
      }
      return { node: "node", script, cwd };
    }
    const resources = process.resourcesPath;
    const nodeExe = path.join(resources, "node", "node.exe");
    const cwd = path.join(resources, "agent");
    const bundlePath = path.join(resources, "agent", "agent.bundle.cjs");
    const agentJsPath = path.join(resources, "agent", "agent.js");
    const script = fs.existsSync(bundlePath) ? bundlePath : agentJsPath;
    const scriptExists = fs.existsSync(script);
    const nodeExists = fs.existsSync(nodeExe);
    log.info("[AgentRunner] Dist nodePath=%s script=%s cwd=%s scriptExists=%s nodeExists=%s", nodeExe, script, cwd, scriptExists, nodeExists);
    if (!scriptExists) {
      log.error("[AgentRunner] Dist: neither agent.bundle.cjs nor agent.js found - run pnpm run bundle:agent before electron-builder.");
      return null;
    }
    if (!nodeExists) {
      log.error("[AgentRunner] Dist: node.exe not found at", nodeExe, "- run node-bundle build so dist runs without system Node.");
      return null;
    }
    return { node: nodeExe, script, cwd };
  } catch (e) {
    log.error("[AgentRunner] getAgentPaths failed", e);
    return null;
  }
}

function ensureLogStreams(): { stdout: fs.WriteStream; stderr: fs.WriteStream } | null {
  const dir = getLogDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stdoutPath = path.join(dir, AGENT_STDOUT);
    const stderrPath = path.join(dir, AGENT_STDERR);
    return {
      stdout: fs.createWriteStream(stdoutPath, { flags: "a" }),
      stderr: fs.createWriteStream(stderrPath, { flags: "a" }),
    };
  } catch (e) {
    log.error("[AgentRunner] Failed to create log streams", e);
    return null;
  }
}

function closeLogStreams(): void {
  if (stdoutStream) {
    try {
      stdoutStream.end();
    } catch {}
    stdoutStream = null;
  }
  if (stderrStream) {
    try {
      stderrStream.end();
    } catch {}
    stderrStream = null;
  }
}

/** Read last N lines from a file; if content is longer than maxChars, return last EXIT_TAIL_LINES_SHORT lines. */
function readLastLines(filePath: string, n: number, maxChars: number): string {
  try {
    if (!fs.existsSync(filePath)) return "(file not found)";
    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const tail = lines.slice(-n).join("\n");
    if (tail.length <= maxChars) return tail;
    return lines.slice(-EXIT_TAIL_LINES_SHORT).join("\n");
  } catch (e) {
    return `(read error: ${(e as Error).message})`;
  }
}

function logAgentExitTail(stderrPath: string, stdoutPath?: string): void {
  const tail = readLastLines(stderrPath, EXIT_TAIL_LINES, EXIT_TAIL_MAX_CHARS);
  log.info("[AgentRunner] Agent exit — last stderr:\n" + tail);
  if (stdoutPath) {
    const stdoutTail = readLastLines(stdoutPath, EXIT_TAIL_LINES_SHORT, 2000);
    if (stdoutTail && stdoutTail !== "(file not found)") {
      log.info("[AgentRunner] Agent exit — last stdout:\n" + stdoutTail);
    }
  }
}

function getBackoffMs(): number {
  const index = Math.min(state.restartCount, BACKOFF_MS.length - 1);
  return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
}

const DEFAULT_WS_URL = "ws://127.0.0.1:22222/";

function mergeWsStatusIntoState(s: AgentState): AgentState {
  const out = { ...s };
  try {
    const userData = app.getPath("userData");
    const statusPath = path.join(userData, "agent-ws-status.json");
    if (fs.existsSync(statusPath)) {
      const raw = fs.readFileSync(statusPath, "utf8");
      const data = JSON.parse(raw) as {
        effectiveUrl?: string;
        status?: string;
        lastFailure?: string;
        attemptNo?: number;
        failureCategory?: string;
        elapsedMs?: number;
        closeCode?: number;
        closeReason?: string;
      };
      if (data.effectiveUrl != null) out.wsEffectiveUrl = data.effectiveUrl;
      if (data.status != null) out.wsStatus = data.status;
      if (data.lastFailure != null) out.wsLastFailure = data.lastFailure;
      if (data.attemptNo != null) out.wsAttemptNo = data.attemptNo;
      if (data.failureCategory != null) out.wsFailureCategory = data.failureCategory;
      if (data.elapsedMs != null) out.wsElapsedMs = data.elapsedMs;
      if (data.closeCode != null) out.wsCloseCode = data.closeCode;
      if (data.closeReason != null) out.wsCloseReason = data.closeReason;
    }
    const pcStatusPath = path.join(userData, "agent-pc-status.json");
    if (fs.existsSync(pcStatusPath)) {
      const pcRaw = fs.readFileSync(pcStatusPath, "utf8");
      const pcData = JSON.parse(pcRaw) as { pc_number?: string | null };
      if (pcData.pc_number != null) out.pc_number = pcData.pc_number;
    }
  } catch {
    // ignore
  }
  if (out.wsEffectiveUrl == null) {
    out.wsEffectiveUrl = process.env.XIAOWEI_WS_URL || DEFAULT_WS_URL;
  }
  return out;
}

export function getAgentState(): AgentState {
  return mergeWsStatusIntoState({ ...state });
}

export function getAgentLogDir(): string {
  return getLogDir();
}

export function getAgentLogPaths(): { stdout: string; stderr: string } {
  const dir = getLogDir();
  return {
    stdout: path.join(dir, AGENT_STDOUT),
    stderr: path.join(dir, AGENT_STDERR),
  };
}

function setState(partial: Partial<AgentState>): void {
  state = { ...state, ...partial };
}

function notifyRenderer(): void {
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send("agent:state", getAgentState());
  }
}

/** Env keys passed from Desktop to agent (spawn env wins over agent dotenv). Required: SUPABASE_URL, SUPABASE_ANON_KEY; optional: XIAOWEI_WS_URL, PC_NUMBER, AGENT_WS_STATUS_FILE, AGENT_DEVICES_FILE, AGENT_SETTINGS_PATH, OPENAI_API_KEY. */
const AGENT_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "XIAOWEI_WS_URL",
  "XIAOWEI_TOOLS_DIR",
  "PC_NUMBER",
  "NODE_ENV",
  "AGENT_WS_STATUS_FILE",
  "AGENT_DEVICES_FILE",
  "AGENT_SETTINGS_PATH",
  "OPENAI_API_KEY",
] as const;

function buildAgentEnv(overrides?: Record<string, string>): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: isDev ? "development" : "production" };
  if (!overrides) return base;
  for (const key of AGENT_ENV_KEYS) {
    const v = overrides[key];
    if (v !== undefined && v !== "") base[key] = v;
  }
  const missing: string[] = [];
  if (!base.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!base.SUPABASE_ANON_KEY?.trim()) missing.push("SUPABASE_ANON_KEY");
  if (missing.length > 0) {
    log.warn("[AgentRunner] Agent spawn env missing (agent may crash): " + missing.join(", "));
  }
  return base;
}

export function startAgent(envOverrides?: Record<string, string>): boolean {
  if (envOverrides) lastEnvOverrides = envOverrides;
  if (child) {
    log.info("[AgentRunner] Agent already running");
    return true;
  }
  const paths = getAgentPaths();
  if (!paths) {
    const msg = isDev
      ? "Agent or Node path not found. Check logs."
      : "Dist: agent.js or bundled node.exe missing. Run build (node-bundle + extraResources) and repackage. No system Node required.";
    log.error("[AgentRunner]", msg);
    setState({ status: "ERROR", lastErrorLine: msg });
    notifyRenderer();
    return false;
  }
  const streams = ensureLogStreams();
  if (!streams) {
    setState({ status: "ERROR", lastErrorLine: "Could not create log files." });
    notifyRenderer();
    return false;
  }
  stdoutStream = streams.stdout;
  stderrStream = streams.stderr;
  const logPaths = getAgentLogPaths();
  log.info("[AgentRunner] script=%s cwd=%s stdoutPath=%s stderrPath=%s", paths.script, paths.cwd, logPaths.stdout, logPaths.stderr);

  const env = buildAgentEnv(envOverrides);
  log.info(
    "[AgentRunner] spawn env: SUPABASE_URL=%s, SUPABASE_ANON_KEY=%s, XIAOWEI_WS_URL=%s",
    env.SUPABASE_URL?.trim() ? "(set)" : "(empty)",
    env.SUPABASE_ANON_KEY?.trim() ? "(set)" : "(empty)",
    env.XIAOWEI_WS_URL?.trim() || "(default)"
  );
  const args = [paths.script];
  log.info("[AgentRunner] Spawning node=%s args=%s", paths.node, args);
  child = spawn(paths.node, args, {
    cwd: paths.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env,
  });

  setState({ status: "RUNNING" });
  notifyRenderer();

  child.stdout?.pipe(stdoutStream!);
  child.stderr?.pipe(stderrStream!);

  child.on("exit", (code, signal) => {
    child = null;
    const codeNum = code ?? (signal === "SIGTERM" ? 0 : -1);
    const logPaths = getAgentLogPaths();
    const stdoutRef = stdoutStream;
    const stderrRef = stderrStream;

    function done(): void {
      logAgentExitTail(logPaths.stderr, logPaths.stdout);
      stdoutStream = null;
      stderrStream = null;
      setState({
        status: "STOPPED",
        lastExitCode: codeNum,
        lastErrorLine: signal ? `Signal: ${signal}` : `Exit code: ${codeNum}`,
      });
      notifyRenderer();
      log.info("[AgentRunner] Agent exited", { code, signal });

      if (state.restartCount >= MAX_RESTARTS) {
        setState({ status: "ERROR", lastErrorLine: `Stopped after ${MAX_RESTARTS} restarts. Export diagnostics.` });
        notifyRenderer();
        return;
      }
      const delay = getBackoffMs();
      setState({ status: "RESTARTING", restartCount: state.restartCount + 1 });
      notifyRenderer();
      log.info("[AgentRunner] Restarting in", delay, "ms (attempt", state.restartCount, ")");
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (xiaoweiReadyCheck && !xiaoweiReadyCheck()) {
          log.info("[AgentRunner] Waiting for Xiaowei before restart...");
          const waitForXiaowei = setInterval(() => {
            if (!xiaoweiReadyCheck || xiaoweiReadyCheck()) {
              clearInterval(waitForXiaowei);
              log.info("[AgentRunner] Xiaowei ready — spawning agent");
              startAgent(lastEnvOverrides);
            }
          }, 3000);
        } else {
          startAgent(lastEnvOverrides);
        }
      }, delay);
    }

    if (!stdoutRef || !stderrRef) {
      done();
      return;
    }
    stdoutRef.end();
    stderrRef.end();
    const FINISH_TIMEOUT_MS = 300;
    const waitFinish = Promise.all([
      new Promise<void>((res) => { stdoutRef.once("finish", res); }),
      new Promise<void>((res) => { stderrRef.once("finish", res); }),
    ]);
    const timeout = new Promise<void>((res) => setTimeout(res, FINISH_TIMEOUT_MS));
    Promise.race([waitFinish, timeout]).then(done);
  });

  child.on("error", (err) => {
    log.error("[AgentRunner] Child process error", err);
    setState({ status: "ERROR", lastErrorLine: err.message });
    notifyRenderer();
  });
  return true;
}

export function stopAgent(): void {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (child) {
    child.kill("SIGTERM");
    child = null;
    closeLogStreams();
    setState({ status: "STOPPED", restartCount: 0 });
    notifyRenderer();
  }
}

export function restartAgent(): void {
  stopAgent();
  setState({ restartCount: 0 });
  startAgent(lastEnvOverrides);
}
