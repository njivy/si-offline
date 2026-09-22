import { all, first, textContent, walk } from '../sec/parse.js';

function normalizeRid(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function articleRids(sec) {
  const set = new Set();
  const refs = all(sec, 'REF');
  for (const ref of refs) {
    const rid = first(ref, 'RID');
    if (rid) set.add(normalizeRid(textContent(rid)));
  }
  return set;
}

function bodyRids(sec) {
  const found = [];
  walk(sec, (node, parent) => {
    if (node.tag !== 'RID') return;
    if (parent && parent.tag === 'REF') return;
    const rid = normalizeRid(textContent(node));
    if (rid) found.push(rid);
  });
  return found;
}

export function checkReferences(sec) {
  const findings = [];
  const article = articleRids(sec);
  const body = bodyRids(sec);
  const seen = new Set();
  for (const rid of body) {
    if (seen.has(rid)) continue;
    seen.add(rid);
    if (!article.has(rid)) {
      findings.push({
        findingId: `ref-${rid}`.replace(/\s+/g, '-'),
        code: 'REFVER.UNRESOLVED',
        severity: 'error',
        section: sec.number || '',
        locator: { tag: 'RID', rid },
        message: `${rid} cited in text is not in the Reference Article.`,
        fixHint: 'Add the RID via the Reference Article or remove the citation.',
      });
    }
  }
  return findings;
}

export function collectArticleRids(sec) {
  return [...articleRids(sec)];
}
