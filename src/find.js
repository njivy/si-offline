/**
 * Tag-aware find / replace with preview. Fail-closed on markup-corrupting replaces.
 */

import { textContent } from './sec/parse.js';

const TAG_FILTERS = {
  text: null,
  open_brackets: (sec, hay) => /\[[^[\]]{0,400}\]/.test(hay),
  unresolved_rid: null, // filled via findings
  notes: (sec) => {
    // NTE / NPR presence
    const raw = sec._raw || '';
    return /<NTE[\s>]|<NPR[\s>]/.test(raw);
  },
};

export function searchJob(sections, { query = '', tagFilter = 'text', findings = [] } = {}) {
  const q = String(query || '');
  const hits = [];
  for (const sec of sections || []) {
    const parsed = sec.parsed || sec;
    const hay = textContent(parsed);
    const raw = parsed._raw || sec.text || '';

    if (tagFilter === 'open_brackets') {
      const re = /\[[^[\]]{0,400}\]/g;
      let m;
      while ((m = re.exec(hay))) {
        if (q && !m[0].toLowerCase().includes(q.toLowerCase())) continue;
        hits.push({
          section: parsed.number || sec.number,
          kind: 'bracket',
          snippet: m[0].slice(0, 100),
          offset: m.index,
        });
      }
      continue;
    }

    if (tagFilter === 'unresolved_rid') {
      for (const f of findings || []) {
        if (f.section !== (parsed.number || sec.number)) continue;
        if (f.code !== 'REFVER.UNRESOLVED') continue;
        if (q && !(f.message || '').toLowerCase().includes(q.toLowerCase()) && !(f.locator?.rid || '').toLowerCase().includes(q.toLowerCase())) continue;
        hits.push({
          section: f.section,
          kind: 'rid',
          snippet: f.locator?.rid || f.message,
          findingId: f.findingId,
        });
      }
      continue;
    }

    if (tagFilter === 'notes') {
      const noteRe = /<(NTE|NPR)[^>]*>([\s\S]*?)<\/\1>/gi;
      let m;
      while ((m = noteRe.exec(raw))) {
        const body = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (q && !body.toLowerCase().includes(q.toLowerCase())) continue;
        hits.push({
          section: parsed.number || sec.number,
          kind: 'note',
          snippet: body.slice(0, 120),
          tag: m[1].toUpperCase(),
        });
      }
      continue;
    }

    // plain text
    if (!q) continue;
    const lower = hay.toLowerCase();
    const needle = q.toLowerCase();
    let from = 0;
    while (from < lower.length) {
      const i = lower.indexOf(needle, from);
      if (i < 0) break;
      hits.push({
        section: parsed.number || sec.number,
        kind: 'text',
        snippet: hay.slice(Math.max(0, i - 20), i + q.length + 40).replace(/\s+/g, ' '),
        offset: i,
      });
      from = i + Math.max(1, q.length);
    }
  }
  return hits;
}

/**
 * Preview a replace across section texts. Rejects replacements that would inject < > or break brackets.
 * @returns {{ ok: boolean, reason?: string, previews: { section: string, before: string, after: string, count: number }[] }}
 */
export function previewReplace(sections, { query, replacement }) {
  const q = String(query || '');
  const rep = String(replacement ?? '');
  if (!q) return { ok: false, reason: 'Empty search.', previews: [] };
  if (/[<>]/.test(rep)) {
    return { ok: false, reason: 'Replacement cannot contain < or > (fail-closed — would corrupt markup).', previews: [] };
  }
  // If query looks like it includes markup, refuse
  if (/[<>]/.test(q)) {
    return { ok: false, reason: 'Search cannot target raw markup characters (fail-closed).', previews: [] };
  }
  const previews = [];
  for (const sec of sections || []) {
    const text = sec.text || '';
    // Only replace inside text nodes approximation: refuse if any match sits inside a tag
    let count = 0;
    let i = 0;
    const lower = text.toLowerCase();
    const needle = q.toLowerCase();
    const unsafe = [];
    while (i < lower.length) {
      const at = lower.indexOf(needle, i);
      if (at < 0) break;
      const before = text.slice(0, at);
      const lastOpen = before.lastIndexOf('<');
      const lastClose = before.lastIndexOf('>');
      if (lastOpen > lastClose) {
        unsafe.push(at);
      } else {
        count++;
      }
      i = at + Math.max(1, q.length);
    }
    if (unsafe.length) {
      return {
        ok: false,
        reason: `Match inside a tag in section ${sec.number} — refuse to avoid corrupting markup.`,
        previews: [],
      };
    }
    if (!count) continue;
    // build after with case-sensitive split on original case occurrences using regex escape
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const after = text.replace(new RegExp(esc, 'g'), rep);
    previews.push({
      section: sec.number,
      count,
      before: text.slice(0, 120),
      after: after.slice(0, 120),
      afterFull: after,
    });
  }
  return { ok: true, previews };
}
