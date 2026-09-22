import { textContent } from './sec/parse.js';

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderChildren(children, opts) {
  return (children || []).map((c) => renderNode(c, opts)).join('');
}

export function renderNode(node, opts = {}) {
  if (typeof node === 'string') return decorateText(node, opts);
  if (!node || !node.tag) return '';
  const tag = node.tag;
  const inner = renderChildren(node.children, opts);
  switch (tag) {
    case 'SEC':
      return `<article class="sec-doc">${inner}</article>`;
    case 'SCN':
      return '';
    case 'STL':
      return `<h1 class="sec-title">${inner}</h1>`;
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
      return `<h2 class="ttl">${inner}</h2>`;
    case 'TXT':
      return `<p class="txt">${inner}</p>`;
    case 'NTE':
    case 'NPR':
      return opts.showNotes === false ? '' : `<aside class="note ${tag.toLowerCase()}">${inner}</aside>`;
    case 'RID':
      return `<span class="tag rid" title="RID">${inner}</span>`;
    case 'RTL':
      return `<span class="tag rtl">${inner}</span>`;
    case 'REF':
      return `<div class="ref">${inner}</div>`;
    case 'SUB':
      return `<span class="tag sub" title="SUB">${inner}</span>`;
    case 'SRF':
      return `<span class="tag srf" title="SRF">${inner}</span>`;
    case 'TAI':
      return opts.showTailoring === false ? inner : `<span class="tag tai">${inner}</span>`;
    case 'ENG':
      return opts.showEng === false ? '' : `<span class="unit eng">${inner}</span>`;
    case 'MET':
      return opts.showMet === false ? '' : `<span class="unit met">${inner}</span>`;
    case 'ADD':
      return `<ins class="rev add">${inner}</ins>`;
    case 'DEL':
      return `<del class="rev del">${inner}</del>`;
    case 'LST':
    case 'OLG':
      return `<ul class="lst">${inner}</ul>`;
    case 'ITM':
    case 'OLI':
      return `<li>${inner}</li>`;
    case 'TAB':
    case 'TBL':
      return `<div class="table-like">${inner}</div>`;
    default:
      return opts.showTags
        ? `<span class="unknown-tag" data-tag="${escapeHtml(tag)}">${inner}</span>`
        : inner;
  }
}

function decorateText(text, opts) {
  const showBrackets = opts.showBrackets !== false;
  const esc = escapeHtml(text);
  if (!showBrackets) return esc;
  return esc.replace(/\[([^\[\]]{0,400})\]/g, '<span class="bracket">[$1]</span>');
}

export function renderSectionHtml(sec, opts = {}) {
  return renderNode(sec, opts);
}

export function plainPreview(sec, max = 240) {
  const t = textContent(sec).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
