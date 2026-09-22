import { textContent } from '../sec/parse.js';

export function checkBrackets(sec) {
  const findings = [];
  const text = textContent(sec);
  const pairs = [...text.matchAll(/\[[^[\]]{0,400}\]/g)];
  for (const m of pairs) {
    findings.push({
      findingId: `brkt-${findings.length + 1}`,
      code: 'BRKTVER.REMAINING',
      severity: 'error',
      section: sec.number || '',
      locator: { offset: m.index, snippet: m[0].slice(0, 80) },
      message: `Remaining bracketed option: ${m[0].slice(0, 80)}`,
      fixHint: 'Choose an option or type a value, then remove the brackets.',
    });
  }
  const stripped = text.replace(/\[[^[\]]*\]/g, '');
  const opens = (stripped.match(/\[/g) || []).length;
  const closes = (stripped.match(/\]/g) || []).length;
  if (opens !== closes) {
    findings.push({
      findingId: `brkt-mismatch`,
      code: 'BRKTVER.MISMATCH',
      severity: 'error',
      section: sec.number || '',
      locator: {},
      message: `Unmatched brackets (${opens} "[" vs ${closes} "]").`,
      fixHint: 'Repair the opening/closing pair.',
    });
  }
  return findings;
}
