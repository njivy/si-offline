import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: false });
  if (r.status !== 0) process.exit(r.status || 1);
}

run('node', [path.join(root, 'scripts', 'build-fixture-job.mjs')]);
run('npx', ['vite', 'build']);
run('node', [path.join(root, 'scripts', 'file-protocol-build.mjs')]);
console.log('wrote dist/ (IIFE + classic scripts for file://)');
