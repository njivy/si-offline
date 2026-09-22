import { all, textContent } from '../sec/parse.js';

function normalizeSrf(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^SECTION\s+/i, '');
}

export function checkSectionRefs(sec, jobSectionNumbers) {
  const have = new Set(
    [...jobSectionNumbers].map((n) => normalizeSrf(n)).filter(Boolean)
  );
  const findings = [];
  for (const node of all(sec, 'SRF')) {
    const cited = normalizeSrf(textContent(node));
    if (!cited) continue;
    const num = cited.match(/(\d{2}\s+\d{2}\s+\d{2}(?:\.\d+)?)/);
    const key = num ? num[1] : cited;
    if (!have.has(key) && ![...have].some((h) => key.startsWith(h) || h.startsWith(key))) {
      findings.push({
        findingId: `srf-${key}`.replace(/\s+/g, '-'),
        code: 'SECTVER.MISSING',
        severity: 'error',
        section: sec.number || '',
        locator: { tag: 'SRF', cited },
        message: `Section ${key} is cited but not in this Job.`,
        related: [key],
        fixHint: 'Add the section to the Job or remove the SRF citation.',
      });
    }
  }
  return findings;
}
