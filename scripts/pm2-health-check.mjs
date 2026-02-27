#!/usr/bin/env node
// pm2-health-check.mjs — Agent 헬스체크 + 비정상 시 pm2 restart (cross-platform)
// 사용법: npm run health
//         Task Scheduler / cron: 1~2분마다 실행
import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const port = parseInt(process.argv[2] || process.env.PORT || '9100');
const unhealthyThresholdSec = parseInt(process.argv[3] || process.env.UNHEALTHY_THRESHOLD || '120');
const healthUrl = `http://127.0.0.1:${port}/health`;
const stateFile = join(tmpdir(), 'doai-agent-health-state.json');

function getState() {
  try {
    if (existsSync(stateFile)) {
      const data = JSON.parse(readFileSync(stateFile, 'utf8'));
      return { firstUnhealthyAt: data.firstUnhealthyAt ?? null, consecutiveOk: data.consecutiveOk ?? 0 };
    }
  } catch {}
  return { firstUnhealthyAt: null, consecutiveOk: 0 };
}

function setState(firstUnhealthyAt, consecutiveOk) {
  writeFileSync(stateFile, JSON.stringify({ firstUnhealthyAt, consecutiveOk }));
}

async function checkHealth() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

const ok = await checkHealth();
const state = getState();

if (ok) {
  setState(null, state.consecutiveOk + 1);
  process.exit(0);
}

// Unhealthy
const now = Math.floor(Date.now() / 1000);
if (state.firstUnhealthyAt === null) {
  setState(now, 0);
  process.exit(0);
}

const elapsed = now - state.firstUnhealthyAt;
if (elapsed < unhealthyThresholdSec) {
  process.exit(0);
}

// > threshold: restart
console.log(`[pm2-health-check] Agent unhealthy for ${elapsed}s — restarting`);
setState(null, 0);
spawnSync('pm2', ['restart', 'agent'], { stdio: 'inherit', shell: true });
