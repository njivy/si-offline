import { textContent } from './sec/parse.js';
import { findBracketGroups } from './bracket.js';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Tags whose rendered host is contenteditable in inline WYSIWYG mode. */
const EDITABLE_TAGS = new Set(['TXT', 'TTL', 'STL', 'NTE', 'NPR', 'RTL', 'ITM', 'OLI']);

function childrenFrom(children, opts) {
  return (children || []).map((c) => renderNode(c, opts)).join('');
}

function editableAttrs(node, opts) {
  if (!opts.editable || !node || !node._nid) return '';
  if (!EDITABLE_TAGS.has(node.tag)) return '';
  return ` data-nid="${escapeHtml(node._nid)}" contenteditable="true" spellcheck="true"`;
}

function dataTagAttrs(node, opts) {
  if (!opts.editable || !node || !node._nid) return '';
  // Nested SI tags inside an editable host must round-trip via data-tag.
  return ` data-nid="${escapeHtml(node._nid)}" data-tag="${escapeHtml(node.tag)}"`;
}

export function renderNode(node, opts = {}) {
  if (typeof node === 'string') return decorateText(node, opts);
  if (!node || !node.tag) return '';
  const tag = node.tag;
  const inner = childrenFrom(node.children, opts);
  const ce = editableAttrs(node, opts);
  const dt = dataTagAttrs(node, opts);

  switch (tag) {
    case 'SEC':
      return `<article class="sec-doc" data-wysiwyg="1"${opts.editable ? ' data-mode="edit"' : ''}>${inner}</article>`;
    case 'SCN':
      return '';
    case 'STL':
      return `<h1 class="sec-title"${ce}>${inner}</h1>`;
    case 'DTE':
    case 'PRA':
    case 'MTA':
    case 'HDR':
    case 'EOD':
    case 'END':
    case 'DOC':
      return '';
    case 'PRT':
      return `<section class="prt">${inner}</section>`;
    case 'SPT':
      return `<section class="spt">${inner}</section>`;
    case 'TTL':
      return `<h2 class="ttl"${ce}>${inner}</h2>`;
    case 'TXT':
      return `<p class="txt"${ce}>${inner}</p>`;
    case 'NTE':
    case 'NPR':
      return opts.showNotes === false
        ? ''
        : `<aside class="note ${tag.toLowerCase()}"${ce}>${inner}</aside>`;
    case 'RID':
      return `<span class="tag rid" title="RID"${dt}>${inner}</span>`;
    case 'RTL':
      return `<span class="tag rtl"${ce}${dt}>${inner}</span>`;
    case 'REF':
      return `<div class="ref">${inner}</div>`;
    case 'SUB':
      return `<span class="tag sub" title="SUB"${dt}>${inner}</span>`;
    case 'SRF':
      return `<span class="tag srf" title="SRF"${dt}>${inner}</span>`;
    case 'TAI':
      return opts.showTailoring === false
        ? inner
        : `<span class="tag tai"${dt}>${inner}</span>`;
    case 'ENG':
      return opts.showEng === false ? '' : `<span class="unit eng"${dt}>${inner}</span>`;
    case 'MET':
      return opts.showMet === false ? '' : `<span class="unit met"${dt}>${inner}</span>`;
    case 'ADD':
      return `<ins class="rev add"${dt}>${inner}</ins>`;
    case 'DEL':
      return `<del class="rev del"${dt}>${inner}</del>`;
    case 'LST':
    case 'OLG':
      return `<ul class="lst">${inner}</ul>`;
    case 'ITM':
    case 'OLI':
      return `<li${ce}>${inner}</li>`;
    case 'TAB':
    case 'TBL':
      return `<div class="table-like">${inner}</div>`;
    default:
      return opts.showTags
        ? `<span class="unknown-tag" data-tag="${escapeHtml(tag)}"${dt}>${inner}</span>`
        : inner;
  }
}

/**
 * Highlight SpecsIntact consecutive bracket groups.
 * Each token gets data-bgroup / data-bopt / data-bsig for the guided picker.
 */
function decorateText(text, opts) {
  const showBrackets = opts.showBrackets !== false;
  if (!showBrackets) return escapeHtml(text);

  const groups = findBracketGroups(text);
  if (!groups.length) return escapeHtml(text);

  let out = '';
  let cursor = 0;
  let gid = 0;
  for (const g of groups) {
    out += escapeHtml(text.slice(cursor, g.start));
    const sig = escapeHtml(JSON.stringify(g.options));
    const kind = escapeHtml(g.kind);
    // Re-scan tokens inside raw to wrap each [opt].
    const raw = g.raw;
    let local = 0;
    const tokRe = /\[([^\[\]]{0,400})\]/g;
    let tm;
    let optIdx = 0;
    while ((tm = tokRe.exec(raw)) !== null) {
      if (tm.index > local) out += escapeHtml(raw.slice(local, tm.index));
      const inner = escapeHtml(tm[1]);
      out += `<span class="bracket" data-bracket="1" data-bgroup="${gid}" data-bopt="${optIdx}" data-bkind="${kind}" data-bsig="${sig}">[${inner}]</span>`;
      optIdx++;
      local = tm.index + tm[0].length;
    }
    if (local < raw.length) out += escapeHtml(raw.slice(local));
    cursor = g.end;
    gid++;
  }
  out += escapeHtml(text.slice(cursor));
  return out;
}

export function renderSectionHtml(sec, opts = {}) {
  return renderNode(sec, opts);
}

export function plainPreview(sec, max = 240) {
  const t = textContent(sec).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
