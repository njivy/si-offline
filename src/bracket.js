/**
 * SpecsIntact-shaped bracket option groups.
 *
 * Verified form (UFGS / SpecsIntact public docs + fixture):
 *   consecutive tokens [opt1][opt2]…  → choose one or more; unselected tokens removed;
 *   chosen text kept without brackets.
 *
 * Fail-closed: nested brackets, unmatched [,], or opaque forms are not mutated.
 * Pipe-inside-bracket ([a|b]) is treated as a single opaque option (not split).
 */

const TOKEN_RE = /\[([^\[\]]{0,400})\]/g;
const GROUP_RE = /\[([^\[\]]{0,400})\](?:\s*\[([^\[\]]{0,400})\])*/g;

/** @typedef {{ start: number, end: number, raw: string, options: string[], kind: 'choice'|'fill'|'single' }} BracketGroup */

/**
 * @param {string} text
 * @returns {BracketGroup[]}
 */
export function findBracketGroups(text) {
  const s = String(text ?? '');
  const groups = [];
  GROUP_RE.lastIndex = 0;
  let m;
  while ((m = GROUP_RE.exec(s)) !== null) {
    const raw = m[0];
    const options = [];
    TOKEN_RE.lastIndex = 0;
    let t;
    while ((t = TOKEN_RE.exec(raw)) !== null) options.push(t[1]);
    if (!options.length) continue;
    // Reject if the match somehow nested (shouldn't with the regex).
    if ((raw.match(/\[/g) || []).length !== (raw.match(/\]/g) || []).length) continue;
    groups.push({
      start: m.index,
      end: m.index + raw.length,
      raw,
      options,
      kind: classifyGroup(options),
    });
  }
  return groups;
}

function classifyGroup(options) {
  if (options.length >= 2) return 'choice';
  const only = options[0] ?? '';
  if (/^[\s_.…\-–—]*$/.test(only) || /^_+$/.test(only.trim()) || only.trim() === '') return 'fill';
  return 'single';
}

/** Stable signature for Job-wide batch matching (exact option list, order-sensitive). */
export function groupSignature(options) {
  return JSON.stringify(options.map((o) => String(o)));
}

/**
 * @param {string} text
 * @param {number} caret  offset into text
 * @returns {BracketGroup|null}
 */
export function groupAtOffset(text, caret) {
  const groups = findBracketGroups(text);
  const c = Math.max(0, caret | 0);
  for (const g of groups) {
    if (c >= g.start && c <= g.end) return g;
  }
  // Prefer nearest group if caret sits just outside whitespace between tokens (already inside).
  return null;
}

/**
 * Apply a choice to one group span in a string. Fail-closed: returns null if unsafe.
 * @param {string} text
 * @param {BracketGroup} group
 * @param {number[]|string[]} choice  indices into group.options, or option text(s)
 * @returns {string|null}
 */
export function applyChoiceToText(text, group, choice) {
  if (!group || typeof text !== 'string') return null;
  const slice = text.slice(group.start, group.end);
  if (slice !== group.raw) return null; // stale / unsafe
  const indices = normalizeChoice(group, choice);
  if (!indices) return null;
  const kept = indices.map((i) => group.options[i]);
  // SpecsIntact keeps selected option text(s) without brackets; join multi with a single space.
  const replacement = kept.join(' ');
  return text.slice(0, group.start) + replacement + text.slice(group.end);
}

/**
 * @param {BracketGroup} group
 * @param {number[]|string[]} choice
 * @returns {number[]|null}
 */
function normalizeChoice(group, choice) {
  if (choice == null) return null;
  const arr = Array.isArray(choice) ? choice : [choice];
  if (!arr.length) return null;
  const indices = [];
  for (const c of arr) {
    if (typeof c === 'number' && Number.isInteger(c) && c >= 0 && c < group.options.length) {
      if (!indices.includes(c)) indices.push(c);
      continue;
    }
    const asText = String(c);
    // Fill-in: allow replacement text for fill/single when not an exact option match.
    if (group.kind === 'fill' || (group.kind === 'single' && group.options[0] !== asText)) {
      // Represent fill as sentinel — handled by caller via applyFillToText.
      return null;
    }
    const i = group.options.indexOf(asText);
    if (i < 0) return null;
    if (!indices.includes(i)) indices.push(i);
  }
  indices.sort((a, b) => a - b);
  return indices.length ? indices : null;
}

/**
 * Replace a fill/single bracket with free text (no brackets). Fail-closed.
 * @param {string} text
 * @param {BracketGroup} group
 * @param {string} value
 * @returns {string|null}
 */
export function applyFillToText(text, group, value) {
  if (!group || typeof text !== 'string') return null;
  if (group.kind === 'choice') return null; // use applyChoiceToText
  const slice = text.slice(group.start, group.end);
  if (slice !== group.raw) return null;
  const v = String(value ?? '');
  // Refuse to re-introduce brackets / tags in the fill value.
  if (/[\[\]<>]/.test(v)) return null;
  return text.slice(0, group.start) + v + text.slice(group.end);
}

/**
 * Walk a parsed .sec tree and mutate string children via fn(text) => next|null.
 * Returns number of string nodes changed.
 */
export function mapTreeStrings(node, fn) {
  let changed = 0;
  function walk(n) {
    if (!n || typeof n === 'string') return;
    if (!Array.isArray(n.children)) return;
    n.children = n.children.map((c) => {
      if (typeof c === 'string') {
        const next = fn(c);
        if (typeof next === 'string' && next !== c) {
          changed++;
          return next;
        }
        return c;
      }
      walk(c);
      return c;
    });
  }
  walk(node);
  return changed;
}

/**
 * Apply choice to the first matching group with signature in a tree (or all in tree).
 * @returns {number} replacements made
 */
export function applyChoiceInTree(secTree, signature, choice, { all = true } = {}) {
  let replacements = 0;
  mapTreeStrings(secTree, (text) => {
    let next = text;
    let guard = 0;
    while (guard++ < 64) {
      const groups = findBracketGroups(next);
      const hit = groups.find((g) => groupSignature(g.options) === signature);
      if (!hit) break;
      const applied = applyChoiceToText(next, hit, choice);
      if (applied == null) break;
      next = applied;
      replacements++;
      if (!all) break;
    }
    return next === text ? null : next;
  });
  return replacements;
}

/**
 * Apply fill value to groups matching signature (typically a single fill token).
 */
export function applyFillInTree(secTree, signature, value, { all = true } = {}) {
  let replacements = 0;
  mapTreeStrings(secTree, (text) => {
    let next = text;
    let guard = 0;
    while (guard++ < 64) {
      const groups = findBracketGroups(next);
      const hit = groups.find((g) => groupSignature(g.options) === signature);
      if (!hit) break;
      const applied = applyFillToText(next, hit, value);
      if (applied == null) break;
      next = applied;
      replacements++;
      if (!all) break;
    }
    return next === text ? null : next;
  });
  return replacements;
}

/**
 * Count Job-wide matches of a signature across section parsed trees.
 * @param {{ number: string, parsed: object }[]} sections
 * @param {string} signature
 * @returns {{ total: number, bySection: { number: string, count: number }[] }}
 */
export function countSignatureInJob(sections, signature) {
  const bySection = [];
  let total = 0;
  for (const sec of sections || []) {
    let count = 0;
    walkStrings(sec.parsed, (text) => {
      for (const g of findBracketGroups(text)) {
        if (groupSignature(g.options) === signature) count++;
      }
    });
    if (count) {
      bySection.push({ number: sec.number, count });
      total += count;
    }
  }
  return { total, bySection };
}

function walkStrings(node, fn) {
  if (!node) return;
  if (typeof node === 'string') {
    fn(node);
    return;
  }
  for (const c of node.children || []) walkStrings(c, fn);
}

/**
 * Collect all unique choice signatures in a Job (for diagnostics).
 */
export function listJobSignatures(sections) {
  const map = new Map();
  for (const sec of sections || []) {
    walkStrings(sec.parsed, (text) => {
      for (const g of findBracketGroups(text)) {
        if (g.kind !== 'choice') continue;
        const sig = groupSignature(g.options);
        const cur = map.get(sig) || { options: g.options, total: 0, sections: new Set() };
        cur.total++;
        cur.sections.add(sec.number);
        map.set(sig, cur);
      }
    });
  }
  return [...map.entries()].map(([signature, v]) => ({
    signature,
    options: v.options,
    total: v.total,
    sections: [...v.sections],
  }));
}

/**
 * Given plain text + a preferred option string that appears as a token, locate its group.
 */
export function groupContainingOption(text, optionText) {
  const needle = String(optionText || '').replace(/^\[|\]$/g, '');
  for (const g of findBracketGroups(text)) {
    if (g.options.includes(needle)) return g;
  }
  return null;
}
