import { checkBrackets } from './bracket.js';
import { checkReferences } from './reference.js';
import { checkSectionRefs } from './section.js';
import { checkStructure } from './structure.js';

export function runQc(sections) {
  const numbers = sections.map((s) => s.number).filter(Boolean);
  const findings = [];
  for (const sec of sections) {
    findings.push(...checkBrackets(sec));
    findings.push(...checkReferences(sec));
    findings.push(...checkSectionRefs(sec, numbers));
    findings.push(...checkStructure(sec));
  }
  return findings;
}

export function summarizeFindings(findings) {
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  return { total: findings.length, errors, warnings };
}

/** Findings that must block Job ZIP export unless the user explicitly overrides. */
export function exportBlockingFindings(findings) {
  const blockCodes = new Set([
    'BRKTVER.REMAINING',
    'BRKTVER.MISMATCH',
    'REFVER.UNRESOLVED',
    'SECTVER.MISSING',
    'STRUCT.EMPTY_RID',
    'STRUCT.EMPTY_SUB',
    'STRUCT.EMPTY_SRF',
    'STRUCT.ILLEGAL_NEST',
    'STRUCT.UNMATCHED_TAG',
  ]);
  return (findings || []).filter((f) => f.severity === 'error' && blockCodes.has(f.code));
}
