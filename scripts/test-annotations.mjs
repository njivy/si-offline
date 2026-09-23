/**
 * Unit checks for review annotations: sidecar format, soft reattach, never mutate .sec.
 */
import assert from 'node:assert/strict';
import {
  emptyAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  resolveAnnotation,
  hashSnippet,
  sectionAnchor,
  findAnnotationTarget,
  flattenAnnotations,
  annotationsToHtml,
  annotationsToMarkdown,
  ensureAnnotations,
} from '../src/annotations.js';
import { writeZip, readZip } from '../src/zip.js';
import { buildJobZip, loadJobFromZipBuffer } from '../src/pack.js';

const secText = `<SEC>
<SCN>03 30 00</SCN>
<STL>CAST-IN-PLACE CONCRETE</STL>
<PRT><TTL>PART 1 GENERAL</TTL>
<SPT><TTL>SUMMARY</TTL>
<TXT>Provide [cast-in-place][precast] concrete for the work.</TXT>
</SPT>
</PRT>
</SEC>
`;

// Format
const store = emptyAnnotations({ sectionNumber: '03 30 00' });
assert.equal(store.format, 'si-offline-annotations');
assert.equal(store.formatVersion, 1);

const ann = createAnnotation({
  sectionNumber: '03 30 00',
  body: 'Confirm precast option with SME',
  author: { displayName: 'Nic', id: null },
  anchor: {
    kind: 'span',
    tag: 'TXT',
    tagPath: ['TXT'],
    pathIndices: [0],
    snippet: 'cast-in-place',
    snippetHash: hashSnippet('cast-in-place'),
    startOffset: 8,
    endOffset: 21,
    nid: null,
    orphan: false,
  },
});
assert.ok(ann.id.startsWith('ann-'));
assert.equal(ann.status, 'open');
store.annotations.push(ann);

let next = resolveAnnotation(store, ann.id, true);
assert.equal(next.annotations[0].status, 'resolved');
next = resolveAnnotation(next, ann.id, false);
assert.equal(next.annotations[0].status, 'open');
next = updateAnnotation(next, ann.id, { body: 'Updated note' });
assert.equal(next.annotations[0].body, 'Updated note');
next = deleteAnnotation(next, ann.id);
assert.equal(next.annotations.length, 0);

// Soft reattach via fake DOM
const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));
if (JSDOM) {
  const dom = new JSDOM(`<div id="root"><article class="sec-doc">
    <p class="txt" data-tag="TXT" data-nid="n1">Provide [cast-in-place][precast] concrete for the work.</p>
  </article></div>`);
  const root = dom.window.document.getElementById('root');
  const hit = findAnnotationTarget(root, {
    anchor: {
      kind: 'span',
      tag: 'TXT',
      tagPath: ['TXT'],
      pathIndices: [0],
      snippet: 'cast-in-place',
      snippetHash: hashSnippet('cast-in-place'),
      nid: 'n1',
    },
  });
  assert.equal(hit.orphan, false);
  assert.ok(hit.el);

  const orphan = findAnnotationTarget(root, {
    anchor: {
      kind: 'span',
      tag: 'TXT',
      tagPath: ['TXT'],
      pathIndices: [0],
      snippet: 'this-text-does-not-exist-zzzz',
      snippetHash: hashSnippet('this-text-does-not-exist-zzzz'),
      nid: null,
    },
  });
  assert.equal(orphan.orphan, true);
  assert.ok(orphan.el?.classList?.contains('sec-doc') || orphan.reason === 'orphan');
} else {
  console.log('jsdom not installed — skipping DOM reattach checks (OK)');
}

// Round-trip through Job ZIP: annotations sidecar present; .sec bytes unchanged
const jobState = {
  job: { name: 'TEST-ANN', title: '', contract: '', location: '', leadSpecifier: '' },
  marking: null,
  outline: { statuses: {} },
  sections: [
    {
      number: '03 30 00',
      title: 'CAST-IN-PLACE CONCRETE',
      path: '03 30 00.sec',
      text: secText,
      parsed: { number: '03 30 00', title: 'CAST-IN-PLACE CONCRETE' },
      hash: 'sha256:deadbeef',
      lineage: { format: 'si-offline-lineage', formatVersion: 1, sectionNumber: '03 30 00', currentHash: 'sha256:deadbeef', origin: { kind: 'imported-sec' } },
      journal: { format: 'si-offline-change-journal', formatVersion: 1, sectionNumber: '03 30 00', entries: [] },
      annotations: {
        format: 'si-offline-annotations',
        formatVersion: 1,
        sectionNumber: '03 30 00',
        annotations: [ann],
      },
    },
  ],
};
jobState.annotationsReview = {
  format: 'si-offline-annotations-review',
  formatVersion: 1,
  exportedAt: new Date().toISOString(),
  job: jobState.job,
  annotations: flattenAnnotations(jobState),
};
jobState.annotationsHtml = annotationsToHtml(jobState);
jobState.annotationsMd = annotationsToMarkdown(jobState);

const blob = await buildJobZip(jobState);
const buf = await blob.arrayBuffer();
const files = await readZip(buf);
assert.ok(files['03 30 00.sec'], 'sec present');
assert.equal(files['03 30 00.sec'], secText, '.sec must be unchanged');
assert.ok(files['annotations/03 30 00.annotations.json'], 'annotations sidecar');
const loadedAnn = JSON.parse(files['annotations/03 30 00.annotations.json']);
assert.equal(loadedAnn.format, 'si-offline-annotations');
assert.equal(loadedAnn.annotations[0].body, 'Confirm precast option with SME');
assert.ok(files['annotations.html'], 'review html');
assert.ok(files['annotations.md'], 'review md');
assert.ok(!files['03 30 00.sec'].includes('Confirm precast'), 'comment must not pollute .sec');

// Reload preserves annotations
const round = await loadJobFromZipBuffer(buf, { sourceLabel: 'test.zip' });
assert.equal(round.sections[0].annotations.annotations[0].body, 'Confirm precast option with SME');

console.log('test-annotations: ok');
