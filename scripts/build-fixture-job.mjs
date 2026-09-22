import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'public', 'fixtures');
const out = path.join(fixtures, 'job-minimal.zip');

const py = `
import json, zipfile
files = ["01 33 00.sec", "01 42 00.sec", "03 30 00.sec"]
manifest = {
  "format": "si-offline-job",
  "formatVersion": 1,
  "exportedAt": "2026-09-22T20:00:00.000Z",
  "job": {"name": "FIXTURE", "title": "Offline SI fixture Job", "contract": "", "location": "", "leadSpecifier": ""},
  "marking": None,
}
with zipfile.ZipFile(${JSON.stringify(out)}, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("si-offline-job.json", json.dumps(manifest, indent=2))
    for name in files:
        z.write(${JSON.stringify(fixtures)} + "/" + name, name)
print("wrote", ${JSON.stringify(out)})
`;

const r = spawnSync('python3', ['-c', py], { encoding: 'utf8' });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  process.exit(r.status || 1);
}
console.log(r.stdout.trim());
