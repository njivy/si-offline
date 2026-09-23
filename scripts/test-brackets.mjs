import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSec } from '../src/sec/parse.js';
import { serializeSec } from '../src/sec/serialize.js';
import {
  findBracketGroups,
  groupSignature,
  applyChoiceToText,
  applyChoiceInTree,
  applyFillToText,
  countSignatureInJob,
} from '../src/bracket.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    failed++;
  } else {
    console.log('ok', msg);
  }
}

const sample =
  'Provide [cast-in-place][precast] concrete with a 28-day compressive strength of [30 MPa][4000 psi].';
const groups = findBracketGroups(sample);
assert(groups.length === 2, 'two consecutive groups');
assert(groups[0].options.join('|') === 'cast-in-place|precast', 'first options');
assert(groups[0].kind === 'choice', 'first is choice');
assert(groups[1].options.join('|') === '30 MPa|4000 psi', 'second options');

const once = applyChoiceToText(sample, groups[0], [0]);
assert(once === 'Provide cast-in-place concrete with a 28-day compressive strength of [30 MPa][4000 psi].', 'pick first option leaves other group');

const g2 = findBracketGroups(once)[0];
const twice = applyChoiceToText(once, g2, ['4000 psi']);
assert(twice === 'Provide cast-in-place concrete with a 28-day compressive strength of 4000 psi.', 'pick second group by text');

// Fail-closed: stale raw
const stale = applyChoiceToText(sample, { ...groups[0], raw: '[nope]' }, [0]);
assert(stale === null, 'stale group fail-closed');

// Fill-in
const fillText = 'Obtain from [_____].';
const fg = findBracketGroups(fillText)[0];
assert(fg.kind === 'fill', 'underscores are fill');
const filled = applyFillToText(fillText, fg, 'USACE');
assert(filled === 'Obtain from USACE.', 'fill apply');
assert(applyFillToText(fillText, fg, 'bad[x]') === null, 'fill rejects brackets');

// Pipe form is opaque single option (not inventively split)
const pipe = findBracketGroups('Use [a|b] here.')[0];
assert(pipe && pipe.options.length === 1 && pipe.options[0] === 'a|b', 'pipe not split');

// Fixture Job-wide signature count
const names = ['01 33 00.sec', '01 42 00.sec', '03 30 00.sec'];
const sections = [];
for (const name of names) {
  const raw = await readFile(path.join(root, 'public', 'fixtures', name), 'utf8');
  const parsed = parseSec(raw);
  sections.push({ number: parsed.number, parsed, text: raw });
}
const sig = groupSignature(['cast-in-place', 'precast']);
const counts = countSignatureInJob(sections, sig);
assert(counts.total === 2, `fixture has 2 cast-in-place/precast (got ${counts.total})`);
assert(counts.bySection.length === 2, 'across 2 sections');

// Apply Job-wide on trees
for (const sec of sections) {
  applyChoiceInTree(sec.parsed, sig, [0], { all: true });
  sec.text = serializeSec(sec.parsed);
}
const after = countSignatureInJob(sections, sig);
assert(after.total === 0, 'signature cleared Job-wide');
assert(sections.every((s) => !s.text.includes('[cast-in-place]') && !s.text.includes('[precast]')), 'tokens gone');
assert(sections.some((s) => s.text.includes('cast-in-place')), 'chosen text remains');

// Strength group untouched until applied
const sig2 = groupSignature(['30 MPa', '4000 psi']);
assert(countSignatureInJob(sections, sig2).total === 1, 'strength group still present');

if (failed) {
  console.error(failed, 'failure(s)');
  process.exit(1);
}
console.log('bracket tests ok');
