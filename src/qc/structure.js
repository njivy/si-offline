import { walk, textContent, all } from '../sec/parse.js';

const VOIDISH = new Set(['PGE', 'NED', 'EOD', 'END', 'AST']);

/**
 * Structural QC: empty RID/SUB/SRF, illegal nests, unmatched tags in raw .sec.
 * Fail-closed — report only; never invent repairs or proprietary markup.
 */
export function checkStructure(sec) {
  const findings = [];
  const section = sec.number || '';

  for (const tag of ['RID', 'SUB', 'SRF']) {
    for (const node of all(sec, tag)) {
      const t = textContent(node).replace(/\s+/g, ' ').trim();
      if (!t) {
        findings.push({
          findingId: `struct-empty-${tag}-${findings.length + 1}`,
          code: `STRUCT.EMPTY_${tag}`,
          severity: 'error',
          section,
          locator: { tag },
          message: `Empty <${tag}> element — SpecsIntact cite is broken.`,
          fixHint: `Fill the ${tag} text or remove the empty tag.`,
        });
      }
    }
  }

  walk(sec, (node, parent) => {
    if (!node?.tag || !parent?.tag) return;
    const bad =
      (node.tag === 'RID' && parent.tag === 'RID') ||
      (node.tag === 'SRF' && (parent.tag === 'RID' || parent.tag === 'SUB')) ||
      (node.tag === 'SUB' && parent.tag === 'RID');
    if (bad) {
      findings.push({
        findingId: `struct-nest-${findings.length + 1}`,
        code: 'STRUCT.ILLEGAL_NEST',
        severity: 'error',
        section,
        locator: { tag: node.tag, parent: parent.tag },
        message: `Illegal nest <${node.tag}> inside <${parent.tag}>.`,
        fixHint: 'Repair the tag hierarchy in Advanced raw source (fail-closed — no auto-fix).',
      });
    }
  });

  const raw = typeof sec._raw === 'string' ? sec._raw : '';
  if (raw) {
    const names = new Set(
      [...raw.matchAll(/<\/?([A-Za-z][\w.-]*)\b/g)].map((m) => m[1].toUpperCase())
    );
    for (const name of names) {
      if (VOIDISH.has(name)) continue;
      const opens = (raw.match(new RegExp('<' + name + '\\b[^>]*>', 'gi')) || []).length;
      const closes = (raw.match(new RegExp('</' + name + '\\s*>', 'gi')) || []).length;
      const self = (raw.match(new RegExp('<' + name + '\\b[^>]*/>', 'gi')) || []).length;
      if (opens - self !== closes) {
        findings.push({
          findingId: `struct-unmatched-${name}`,
          code: 'STRUCT.UNMATCHED_TAG',
          severity: 'error',
          section,
          locator: { tag: name },
          message: `Unmatched <${name}> tags (${opens - self} open vs ${closes} close).`,
          fixHint: 'Repair opening/closing tags in Advanced raw source before export.',
        });
      }
    }
  }

  return findings;
}
