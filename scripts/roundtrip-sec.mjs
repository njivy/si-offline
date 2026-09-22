import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSec } from '../src/sec/parse.js';
import { serializeSec } from '../src/sec/serialize.js';
import { hashSecText } from '../src/sec/hash.js';
import { normalizeSecText } from '../src/sec/normalize.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = ['01 33 00.sec', '01 42 00.sec', '03 30 00.sec'];

let failed = 0;
for (const name of fixtures) {
  const raw = await readFile(path.join(root, 'public', 'fixtures', name), 'utf8');
  const parsed = parseSec(raw);
  if (!parsed.number) {
    console.error(name, 'missing SCN');
    failed++;
    continue;
  }
  const once = serializeSec(parsed);
  const twice = serializeSec(parseSec(once));
  if (once !== twice) {
    console.error(name, 'serialize not stable');
    failed++;
    continue;
  }
  const h1 = await hashSecText(raw);
  const h2 = await hashSecText(normalizeSecText(raw));
  if (h1 !== h2) {
    console.error(name, 'hash not stable under normalize');
    failed++;
    continue;
  }
  if (!parsed.rids) {
    console.error(name, 'missing rid extract');
    failed++;
    continue;
  }
  console.log('ok', name, parsed.number, parsed.title, h1.slice(0, 22));
}

if (failed) {
  console.error(failed, 'failure(s)');
  process.exit(1);
}
console.log('roundtrip ok');
