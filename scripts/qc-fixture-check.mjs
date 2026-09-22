import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSec } from '../src/sec/parse.js';
import { runQc } from '../src/qc/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['01 33 00.sec', '01 42 00.sec', '03 30 00.sec'];
const sections = [];
for (const name of names) {
  const raw = await readFile(path.join(root, 'public', 'fixtures', name), 'utf8');
  sections.push(parseSec(raw));
}

const findings = runQc(sections);
const codes = findings.map((f) => f.code).sort();
console.log('findings', findings.length);
for (const f of findings) console.log('-', f.code, f.section, f.message);

const expect = ['BRKTVER.REMAINING', 'REFVER.UNRESOLVED', 'SECTVER.MISSING'];
const missing = expect.filter((c) => !codes.includes(c));
if (missing.length) {
  console.error('missing expected codes', missing);
  process.exit(1);
}
if (!findings.some((f) => f.code === 'REFVER.UNRESOLVED' && /ACI 301/.test(f.message))) {
  console.error('expected unresolved ACI 301');
  process.exit(1);
}
console.log('qc fixture ok');
