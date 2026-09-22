import { escapeHtml, renderSectionHtml } from './render.js';
import { serializeSec } from './sec/serialize.js';

let nidSeq = 0;

export function stampIds(node) {
  if (!node || typeof node === 'string') return;
  if (!node._nid) node._nid = `n${++nidSeq}`;
  for (const c of node.children || []) stampIds(c);
}

export function findByNid(node, nid) {
  if (!node || typeof node === 'string') return null;
  if (node._nid === nid) return node;
  for (const c of node.children || []) {
    const hit = findByNid(c, nid);
    if (hit) return hit;
  }
  return null;
}

export function renderEditableHtml(sec) {
  stampIds(sec);
  return renderSectionHtml(sec, { showNotes: true, showTags: true, editable: true });
}

export function toolbarHtml() {
  return `<div class="wysiwyg-toolbar" id="wysiwyg-toolbar">
    <button type="button" data-cmd="pick-bracket">Pick bracket</button>
    <button type="button" data-cmd="wrap-rid">RID</button>
    <button type="button" data-cmd="wrap-sub">SUB</button>
    <button type="button" data-cmd="wrap-srf">SRF</button>
    <span class="hint">Click a pink bracket to keep that option. TXT / titles / notes are editable.</span>
  </div>`;
}

function childrenFromDom(el) {
  const out = [];
  for (const child of el.childNodes) {
    if (child.nodeType === 3) {
      if (child.textContent) out.push(child.textContent);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tagName = (child.getAttribute('data-tag') || '').toUpperCase();
    if (tagName) {
      out.push({ tag: tagName, attrs: {}, children: childrenFromDom(child) });
      continue;
    }
    if (child.classList.contains('bracket')) {
      out.push(child.textContent || '');
      continue;
    }
    out.push(...childrenFromDom(child));
  }
  return out;
}

export function applyEditableDom(rootEl, sec) {
  if (!rootEl || !sec) return sec;
  for (const el of rootEl.querySelectorAll('[data-nid][contenteditable="true"]')) {
    const node = findByNid(sec, el.getAttribute('data-nid'));
    if (node) node.children = childrenFromDom(el);
  }
  return sec;
}

export function pickBracketInTree(sec, rawOption) {
  const needle = String(rawOption || '').replace(/^\[|\]$/g, '');
  function walk(n) {
    if (!n || typeof n === 'string') return;
    if (Array.isArray(n.children)) {
      n.children = n.children.map((c) => {
        if (typeof c !== 'string') return c;
        return c.replace(/\[([^\[\]]{0,400})\]/g, (m, inner) => (inner === needle ? inner : m));
      });
    }
    for (const c of n.children || []) walk(c);
  }
  walk(sec);
}

export function wrapSelectionAsTag(sec, selectedText, tag) {
  const text = String(selectedText || '').trim();
  if (!text) return false;
  const tagU = tag.toUpperCase();
  function walk(n) {
    if (!n || typeof n === 'string') return;
    if (!Array.isArray(n.children)) return;
    const next = [];
    for (const c of n.children) {
      if (typeof c === 'string' && c.includes(text)) {
        const i = c.indexOf(text);
        if (i >= 0) {
          if (i) next.push(c.slice(0, i));
          next.push({ tag: tagU, attrs: {}, children: [text] });
          next.push(c.slice(i + text.length));
          continue;
        }
      }
      next.push(c);
      walk(c);
    }
    n.children = next;
  }
  walk(sec);
  return true;
}

export function serializeFromTree(sec) {
  return serializeSec(sec);
}

export { escapeHtml };
