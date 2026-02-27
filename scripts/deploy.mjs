#!/usr/bin/env node
// deploy.mjs — PC Agent 배포 스크립트 (cross-platform)
// 사용법: npm run deploy [-- --version v0.2.0]
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function run(args, opts = {}) {
  const [cmd, ...rest] = args;
  const r = spawnSync(cmd, rest, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
  return r;
}

function capture(args, cwd = ROOT) {
  const [cmd, ...rest] = args;
  const r = spawnSync(cmd, rest, { cwd, encoding: 'utf8', shell: true });
  return r.stdout?.trim() ?? '';
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { version: { type: 'string', default: '' }, force: { type: 'boolean', default: false } },
  strict: false,
});
const version = values.version || '';

console.log('═══════════════════════════════════════');
console.log('  DoAi.Me Agent Deploy');
console.log('═══════════════════════════════════════');

const currentCommit = capture(['git', 'rev-parse', '--short', 'HEAD']);
const currentTag = capture(['git', 'describe', '--tags', '--always']) || currentCommit;
console.log(`[1] 현재: ${currentTag} (${currentCommit})`);

console.log('[2] git pull...');
run(['git', 'fetch', 'origin']);
if (version) {
  console.log(`    버전 지정: ${version}`);
  run(['git', 'checkout', version]);
} else {
  run(['git', 'pull', 'origin', 'main']);
}
const newCommit = capture(['git', 'rev-parse', '--short', 'HEAD']);
console.log(`    업데이트: ${newCommit}`);

console.log('[3] npm ci...');
run(['npm', 'ci', '--silent']);
run(['npm', 'ci', '--silent'], { cwd: join(ROOT, 'agent') });

console.log('[4] 설정 검증...');
const envFile = join(ROOT, 'agent', '.env');
if (!existsSync(envFile)) { console.error('    ✗ agent/.env 파일 없음!'); process.exit(1); }
const pcMatch = readFileSync(envFile, 'utf8').match(/PC_NUMBER=(.+)/);
console.log(`    PC_NUMBER: ${pcMatch ? pcMatch[1].trim() : '(없음)'}`);

console.log(`[5] Node.js: ${process.version}`);
if (!process.version.startsWith('v22')) console.warn('    ⚠ Node.js 22.x 권장');

const pm2Check = spawnSync('pm2', ['--version'], { stdio: 'pipe', shell: true });
const pm2Installed = pm2Check.status === 0;
if (pm2Installed) {
  console.log('[6] PM2 확인됨');
  const restart = spawnSync('pm2', ['restart', 'agent'], { cwd: ROOT, stdio: 'inherit', shell: true });
  if (restart.status !== 0) run(['pm2', 'start', 'agent/ecosystem.config.js']);
  console.log('    Windows 부팅 자동 시작: pm2-startup install && pm2 save');
} else {
  console.warn('[6] PM2 미설치 — 수동 실행: node agent/agent.js');
}

console.log('[7] Smoke test...');
const smoke = spawnSync('node', ['scripts/smoke-test.js'], { cwd: ROOT, stdio: 'inherit', shell: true });
const smokeOk = smoke.status === 0;
if (!smokeOk) console.warn('    ⚠ Smoke test 실패 (Agent 실행 후 재실행 권장)');

console.log('');
console.log('═══════════════════════════════════════');
console.log(`  배포 완료: ${currentTag} → ${newCommit}`);
console.log(pm2Installed ? '  PM2: pm2 status / pm2 logs' : '  시작: node agent/agent.js');
console.log(smokeOk ? '  Smoke test: PASS' : '  Smoke test: FAIL');
console.log('═══════════════════════════════════════');
