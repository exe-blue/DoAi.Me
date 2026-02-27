#!/usr/bin/env node
// rollback.mjs — 긴급 롤백 (cross-platform)
// 사용법: npm run rollback -- v0.1.0
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const version = process.argv[2];
if (!version) {
  console.error('사용법: npm run rollback -- <version>');
  console.error('예:     npm run rollback -- v0.1.0');
  process.exit(1);
}

// Validate version format to prevent injection
if (!/^[a-zA-Z0-9._\-/]+$/.test(version)) {
  console.error('유효하지 않은 버전 형식:', version);
  process.exit(1);
}

function run(args, opts = {}) {
  const [cmd, ...rest] = args;
  const r = spawnSync(cmd, rest, { cwd: ROOT, stdio: 'inherit', shell: true, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function capture(args) {
  const [cmd, ...rest] = args;
  return spawnSync(cmd, rest, { cwd: ROOT, encoding: 'utf8', shell: true }).stdout?.trim() ?? '';
}

const current = capture(['git', 'describe', '--tags', '--always']) || capture(['git', 'rev-parse', '--short', 'HEAD']);
console.log(`롤백: ${current} → ${version}`);

run(['git', 'fetch', 'origin']);
run(['git', 'checkout', version]);
run(['npm', 'ci', '--silent'], { cwd: join(ROOT, 'agent') });

console.log(`✓ 롤백 완료: ${version}`);
console.log('시작: node agent/agent.js');
