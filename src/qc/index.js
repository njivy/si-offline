import { checkBrackets } from './bracket.js';
import { checkReferences } from './reference.js';
import { checkSectionRefs } from './section.js';

export function runQc(sections) {
  const numbers = sections.map((s) => s.number).filter(Boolean);
  const findings = [];
  for (const sec of sections) {
    findings.push(...checkBrackets(sec));
    findings.push(...checkReferences(sec));
    findings.push(...checkSectionRefs(sec, numbers));
  }
  return findings;
}

export function summarizeFindings(findings) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  return { total: findings.length, errors, warnings };
}
