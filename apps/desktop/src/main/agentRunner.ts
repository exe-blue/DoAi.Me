/**
 * Runs and monitors the embedded Node agent (agent/agent.js) as a child process.
 * - Dev: repo root agent/agent.js, system "node" from PATH.
 * - Dist: process.resourcesPath/agent/agent.js, process.resourcesPath/node/node.exe.
 * - Stdout/stderr appended to userData/logs/agent-*.log.
 * - Restart with backoff (2s → 5s → 10s), max 5 retries then STOPPED.
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
const AGENT_STDOUT = "agent-stdout.log";
const AGENT_STDERR = "agent-stderr.log";

export type AgentStatus = "RUNNING" | "STOPPED" | "RESTARTING" | "ERROR";

export interface AgentState {
  status: AgentStatus;
  lastExitCode: number | null;
  lastErrorLine: string;
  restartCount: number;
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

function getLogDir(): string {
  return path.join(app.getPath("userData"), AGENT_LOG_DIR);
}

function getAgentPaths(): { node: string; script: string; cwd: string } | null {
  try {
    if (isDev) {
      const appPath = app.getAppPath();
      const repoRoot = path.resolve(appPath, "..", "..");
      const script = path.join(repoRoot, "agent", "agent.js");
      const cwd = path.join(repoRoot, "agent");
      if (!fs.existsSync(script)) {
        log.error("[AgentRunner] Dev: agent.js not found at", script);
        return null;
      }
      return { node: "node", script, cwd };
    }
    const resources = process.resourcesPath;
    const script = path.join(resources, "agent", "agent.js");
    const cwd = path.join(resources, "agent");
    const nodeExe = path.join(resources, "node", "node.exe");
    if (!fs.existsSync(script)) {
      log.error("[AgentRunner] Dist: agent.js not found at", script);
      return null;
    }
    if (!fs.existsSync(nodeExe)) {
      log.error("[AgentRunner] Dist: node.exe not found at", nodeExe);
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

function getBackoffMs(): number {
  const index = Math.min(state.restartCount, BACKOFF_MS.length - 1);
  return BACKOFF_MS[index] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
}

export function getAgentState(): AgentState {
  return { ...state };
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

export function startAgent(): boolean {
  if (child) {
    log.info("[AgentRunner] Agent already running");
    return true;
  }
  const paths = getAgentPaths();
  if (!paths) {
    setState({ status: "ERROR", lastErrorLine: "Agent or Node path not found. Check logs." });
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

  const args = [paths.script];
  log.info("[AgentRunner] Spawning", paths.node, args.join(" "), "cwd:", paths.cwd);
  child = spawn(paths.node, args, {
    cwd: paths.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    env: { ...process.env, NODE_ENV: isDev ? "development" : "production" },
  });

  setState({ status: "RUNNING" });
  notifyRenderer();

  child.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    stdoutStream?.write(line);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    stderrStream?.write(line);
  });

  child.on("exit", (code, signal) => {
    child = null;
    closeLogStreams();
    const codeNum = code ?? (signal === "SIGTERM" ? 0 : -1);
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
      startAgent();
    }, delay);
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
  startAgent();
}
