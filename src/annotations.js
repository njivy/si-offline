/**
 * Inline review annotations — sidecar only.
 * Never written into .sec. Official SpecsIntact ignores these files.
 *
 * Anchor strategy (durable across edits where practical):
 *  1. tagPath + pathIndices (structural path from SEC root)
 *  2. tag name + text snippet (+ soft hash)
 *  3. optional character offsets within the host text
 * Soft reattach: path → snippet match → section-level orphan.
 * Ephemeral data-nid is used only for in-session decorate/jump.
 */

import { uid } from './journal.js';

export const ANN_FORMAT = 'si-offline-annotations';
export const ANN_VERSION = 1;

export function emptyAnnotations({ sectionNumber } = {}) {
  return {
    format: ANN_FORMAT,
    formatVersion: ANN_VERSION,
    sectionNumber: sectionNumber || '',
    annotations: [],
  };
}

export function ensureAnnotations(sec) {
  if (!sec.annotations || sec.annotations.format !== ANN_FORMAT) {
    sec.annotations = emptyAnnotations({ sectionNumber: sec.number });
  }
  if (!Array.isArray(sec.annotations.annotations)) sec.annotations.annotations = [];
  sec.annotations.sectionNumber = sec.number || sec.annotations.sectionNumber;
  return sec.annotations;
}

/** Sync soft hash for snippet drift detection (not cryptographic). */
export function hashSnippet(text) {
  let h = 5381;
  const t = String(text || '');
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h) ^ t.charCodeAt(i);
  return `djb2:${(h >>> 0).toString(16)}`;
}

/**
 * Build a durable path from the SEC root to a DOM host that has data-nid / data-tag.
 * Falls back to walking parents collecting tag names.
 */
export function tagPathFromEl(el, rootEl) {
  const tags = [];
  const indices = [];
  let cur = el;
  while (cur && cur !== rootEl && cur.nodeType === 1) {
    const tag = (cur.getAttribute?.('data-tag') || '').toUpperCase()
      || inferTagFromClass(cur);
    if (tag) {
      const parent = cur.parentElement;
      let idx = 0;
      if (parent) {
        const siblings = [...parent.children].filter((c) => {
          const t = (c.getAttribute?.('data-tag') || '').toUpperCase() || inferTagFromClass(c);
          return t === tag;
        });
        idx = Math.max(0, siblings.indexOf(cur));
      }
      tags.unshift(tag);
      indices.unshift(idx);
    }
    cur = cur.parentElement;
  }
  return { tagPath: tags, pathIndices: indices };
}

function inferTagFromClass(el) {
  if (!el?.classList) return '';
  if (el.classList.contains('txt')) return 'TXT';
  if (el.classList.contains('ttl')) return 'TTL';
  if (el.classList.contains('sec-title')) return 'STL';
  if (el.classList.contains('rid')) return 'RID';
  if (el.classList.contains('rtl')) return 'RTL';
  if (el.classList.contains('sub')) return 'SUB';
  if (el.classList.contains('srf')) return 'SRF';
  if (el.classList.contains('note') && el.classList.contains('nte')) return 'NTE';
  if (el.classList.contains('note') && el.classList.contains('npr')) return 'NPR';
  if (el.classList.contains('prt')) return 'PRT';
  if (el.classList.contains('spt')) return 'SPT';
  if (el.tagName === 'LI') return 'ITM';
  return '';
}

/**
 * Capture an anchor from the current selection inside the WYSIWYG root,
 * or from a clicked host element.
 */
export function captureAnchorFromSelection(rootEl, { hostEl = null } = {}) {
  if (!rootEl) return sectionAnchor();

  const sel = rootEl.ownerDocument?.getSelection?.();
  let range = null;
  if (sel && sel.rangeCount && !sel.isCollapsed && rootEl.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0);
  }

  let host = hostEl;
  let snippet = '';
  let startOffset = null;
  let endOffset = null;

  if (range) {
    snippet = String(range.toString() || '').replace(/\s+/g, ' ').trim();
    host = host || closestAnchorHost(range.commonAncestorContainer, rootEl);
    // Prefer an editable content host (TXT/TTL/…) over a decorative bracket span
    if (host?.classList?.contains('bracket') || host?.getAttribute?.('data-bracket')) {
      host = closestAnchorHost(host.parentElement, rootEl) || host;
    }
    if (host) {
      const full = (host.textContent || '').replace(/\s+/g, ' ');
      const needle = snippet.slice(0, 80);
      const at = needle ? full.indexOf(needle) : -1;
      if (at >= 0) {
        startOffset = at;
        endOffset = at + needle.length;
      }
    }
  } else if (host) {
    snippet = String(host.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  if (!host || !rootEl.contains(host)) {
    return sectionAnchor({ snippet });
  }

  // If we only found the sec-doc root, treat as section-level
  if (host.classList?.contains('sec-doc') || host.id === 'wysiwyg-root') {
    return sectionAnchor({ snippet });
  }

  const tag = (host.getAttribute('data-tag') || '').toUpperCase() || inferTagFromClass(host) || 'TXT';
  const { tagPath, pathIndices } = tagPathFromEl(host, rootEl);
  const nid = host.getAttribute('data-nid') || null;

  return {
    kind: snippet ? 'span' : 'host',
    tag,
    tagPath: tagPath.length ? tagPath : [tag],
    pathIndices: pathIndices.length ? pathIndices : [0],
    snippet: snippet || '',
    snippetHash: hashSnippet(snippet || (host.textContent || '').slice(0, 120)),
    startOffset,
    endOffset,
    nid, // session hint only; not relied on after re-parse
    orphan: false,
  };
}

export function sectionAnchor({ snippet = '' } = {}) {
  return {
    kind: 'section',
    tag: 'SEC',
    tagPath: ['SEC'],
    pathIndices: [0],
    snippet: snippet || '',
    snippetHash: hashSnippet(snippet || ''),
    startOffset: null,
    endOffset: null,
    nid: null,
    orphan: !snippet,
  };
}

function closestAnchorHost(node, rootEl) {
  let el = node?.nodeType === 3 ? node.parentElement : node;
  while (el && el !== rootEl) {
    if (el.getAttribute?.('data-nid') || el.getAttribute?.('data-tag') || inferTagFromClass(el)) {
      return el;
    }
    el = el.parentElement;
  }
  return rootEl?.querySelector?.('.sec-doc') || rootEl;
}

export function createAnnotation({
  sectionNumber,
  body,
  author,
  anchor,
  at,
} = {}) {
  const when = at || new Date().toISOString();
  return {
    id: uid('ann'),
    at: when,
    updatedAt: when,
    author: author || { displayName: 'unspecified', id: null },
    body: String(body || '').trim(),
    status: 'open',
    anchor: anchor || sectionAnchor(),
  };
}

export function updateAnnotation(store, id, patch) {
  const list = store.annotations || [];
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return store;
  const next = [...list];
  next[i] = {
    ...next[i],
    ...patch,
    updatedAt: new Date().toISOString(),
    id: next[i].id,
    at: next[i].at,
  };
  return { ...store, annotations: next };
}

export function deleteAnnotation(store, id) {
  return {
    ...store,
    annotations: (store.annotations || []).filter((a) => a.id !== id),
  };
}

export function resolveAnnotation(store, id, resolved = true) {
  return updateAnnotation(store, id, { status: resolved ? 'resolved' : 'open' });
}

/**
 * Locate a DOM node for an annotation inside the WYSIWYG paper.
 * Returns { el, orphan, reason }.
 */
export function findAnnotationTarget(rootEl, annotation) {
  if (!rootEl || !annotation) return { el: null, orphan: true, reason: 'missing' };
  const anchor = annotation.anchor || {};
  if (anchor.kind === 'section') {
    return { el: rootEl.querySelector('.sec-doc') || rootEl, orphan: false, reason: 'section' };
  }

  // 1. Session nid (best when tree not re-parsed)
  if (anchor.nid) {
    const byNid = rootEl.querySelector(`[data-nid="${cssEscape(anchor.nid)}"]`);
    if (byNid) {
      const ok = snippetStillMatches(byNid, anchor);
      if (ok) return { el: byNid, orphan: false, reason: 'nid' };
    }
  }

  // 2. Tag path + indices
  const byPath = resolveByPath(rootEl, anchor.tagPath, anchor.pathIndices);
  if (byPath) {
    if (snippetStillMatches(byPath, anchor)) {
      return { el: byPath, orphan: false, reason: 'path' };
    }
    // Path host exists but snippet drifted — soft: still use host if tag matches
    if (!anchor.snippet) return { el: byPath, orphan: false, reason: 'path-no-snippet' };
  }

  // 3. Snippet text search (soft reattach)
  if (anchor.snippet) {
    const needle = String(anchor.snippet).slice(0, 80);
    const tag = (anchor.tag || '').toUpperCase();
    const candidates = tag
      ? [...rootEl.querySelectorAll(`[data-tag="${tag}"], .${tag.toLowerCase()}, .tag.${tag.toLowerCase()}`)]
      : [];
    const pool = candidates.length
      ? candidates
      : [...rootEl.querySelectorAll('[data-nid], .txt, .ttl, .sec-title, .note, .tag')];
    for (const el of pool) {
      const t = (el.textContent || '').replace(/\s+/g, ' ');
      if (t.includes(needle)) return { el, orphan: false, reason: 'snippet' };
    }
    // Broader text walk
    const walker = rootEl.ownerDocument.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.textContent || '').includes(needle.slice(0, 48))) {
        return {
          el: closestAnchorHost(node, rootEl),
          orphan: false,
          reason: 'text-walk',
        };
      }
    }
  }

  // Fail-closed: section-level orphan (reattach needed)
  return {
    el: rootEl.querySelector('.sec-doc') || rootEl,
    orphan: true,
    reason: 'orphan',
  };
}

function snippetStillMatches(el, anchor) {
  if (!anchor?.snippet) return true;
  const t = (el.textContent || '').replace(/\s+/g, ' ');
  const snip = String(anchor.snippet).replace(/\s+/g, ' ');
  if (t.includes(snip.slice(0, 80))) return true;
  if (anchor.snippetHash && hashSnippet(snip) === anchor.snippetHash && t.includes(snip.slice(0, 24))) {
    return true;
  }
  return false;
}

function resolveByPath(rootEl, tagPath, pathIndices) {
  const tags = tagPath || [];
  const indices = pathIndices || [];
  if (!tags.length) return null;
  let scope = rootEl.querySelector('.sec-doc') || rootEl;
  for (let i = 0; i < tags.length; i++) {
    const tag = String(tags[i]).toUpperCase();
    if (tag === 'SEC') continue;
    const idx = indices[i] ?? 0;
    const matches = [...scope.querySelectorAll(`[data-tag="${tag}"], .${cssClassForTag(tag)}`)].filter(
      (el) => scope.contains(el) && (el.parentElement === scope || closestTaggedAncestor(el, scope) === scope || true)
    );
    // Prefer direct-ish children; fall back to document order within scope
    const ordered = [...scope.querySelectorAll(`[data-tag="${tag}"], .${cssClassForTag(tag)}`)].filter((el) =>
      scope.contains(el)
    );
    // Dedupe to elements whose nearest matching depth is correct: take nth of tag in scope
    const unique = [];
    const seen = new Set();
    for (const el of ordered) {
      if (seen.has(el)) continue;
      // Skip descendants of already-chosen deeper matches of same tag under wrong parent — keep simple: nth in order
      seen.add(el);
      unique.push(el);
    }
    const hit = unique[idx];
    if (!hit) return null;
    scope = hit;
  }
  return scope;
}

function closestTaggedAncestor(el, stop) {
  let cur = el.parentElement;
  while (cur && cur !== stop) {
    if (cur.getAttribute?.('data-tag') || inferTagFromClass(cur)) return cur;
    cur = cur.parentElement;
  }
  return stop;
}

function cssClassForTag(tag) {
  const map = {
    TXT: 'txt',
    TTL: 'ttl',
    STL: 'sec-title',
    RID: 'rid',
    RTL: 'rtl',
    SUB: 'sub',
    SRF: 'srf',
    NTE: 'nte',
    NPR: 'npr',
    PRT: 'prt',
    SPT: 'spt',
    ITM: 'lst > li',
  };
  return map[tag] || tag.toLowerCase();
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
  return String(s).replace(/["\\]/g, '\\$&');
}

export function listOpen(store) {
  return (store?.annotations || []).filter((a) => a.status !== 'resolved');
}

export function listAll(store) {
  return store?.annotations || [];
}

export function countForJob(sections) {
  let open = 0;
  let total = 0;
  for (const sec of sections || []) {
    for (const a of sec.annotations?.annotations || []) {
      total++;
      if (a.status !== 'resolved') open++;
    }
  }
  return { open, total };
}

/**
 * Flatten annotations for review export (HTML/MD sidecars).
 */
export function flattenAnnotations(jobState) {
  const rows = [];
  for (const sec of jobState.sections || []) {
    for (const a of sec.annotations?.annotations || []) {
      rows.push({
        section: sec.number,
        title: sec.title,
        id: a.id,
        at: a.at,
        updatedAt: a.updatedAt,
        author: a.author?.displayName || 'unknown',
        status: a.status || 'open',
        body: a.body || '',
        snippet: a.anchor?.snippet || '',
        orphan: !!a.anchor?.orphan,
        tag: a.anchor?.tag || '',
        kind: a.anchor?.kind || 'section',
      });
    }
  }
  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return rows;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function annotationsToHtml(jobState, rows) {
  const list = rows || flattenAnnotations(jobState);
  const tr = list
    .map(
      (r) => `<tr class="st-${esc(r.status)}">
      <td>${esc(r.at)}</td>
      <td>${esc(r.section)}</td>
      <td>${esc(r.author)}</td>
      <td>${esc(r.status)}</td>
      <td>${esc(r.tag)} ${r.orphan ? '<em>(reattach needed)</em>' : ''}</td>
      <td>${esc(r.snippet)}</td>
      <td>${esc(r.body)}</td>
    </tr>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Review annotations — ${esc(jobState.job?.name || '')}</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:1.5rem;color:#111}
  h1{font-size:1.2rem}
  .banner{background:#e0e7ff;border:1px solid #818cf8;padding:.6rem .8rem;margin-bottom:1rem}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ccc;padding:.35rem .5rem;vertical-align:top}
  th{background:#f4f4f5;text-align:left}
  .st-resolved{opacity:.65}
  .meta{color:#555;font-size:.85rem}
</style></head><body>
<div class="banner"><strong>Review only.</strong> Annotations are Offline SI sidecar data
(<code>annotations/*.json</code>). Section <code>.sec</code> files stay clean SpecsIntact text.
Official SpecsIntact ignores these sidecars.</div>
<h1>Review annotations — ${esc(jobState.job?.name || '')}</h1>
<p class="meta">${list.length} annotation(s)</p>
<table>
<thead><tr><th>When</th><th>Section</th><th>Who</th><th>Status</th><th>Anchor</th><th>Snippet</th><th>Comment</th></tr></thead>
<tbody>
${tr || '<tr><td colspan="7">No annotations.</td></tr>'}
</tbody></table>
</body></html>`;
}

export function annotationsToMarkdown(jobState, rows) {
  const list = rows || flattenAnnotations(jobState);
  const lines = [
    `# Review annotations — ${jobState.job?.name || ''}`,
    '',
    '> Review only. Sidecar `annotations/*.json`. `.sec` files remain clean SpecsIntact text.',
    '',
    '| When | Section | Who | Status | Anchor | Snippet | Comment |',
    '|------|---------|-----|--------|--------|---------|---------|',
  ];
  for (const r of list) {
    const anchor = `${r.tag || ''}${r.orphan ? ' (reattach)' : ''}`;
    lines.push(
      `| ${r.at || ''} | ${r.section || ''} | ${r.author || ''} | ${r.status || ''} | ${md(anchor)} | ${md(r.snippet)} | ${md(r.body)} |`
    );
  }
  if (!list.length) lines.push('| — | — | — | — | — | — | (none) |');
  return lines.join('\n');
}

function md(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
