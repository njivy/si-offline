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

/**
 * SpecsIntact-oriented toolbar: B/I (visual; .sec has no native bold/italic),
 * bracket pick, and RID / SUB / SRF wraps.
 */
export function toolbarHtml() {
  return `<div class="wysiwyg-toolbar" id="wysiwyg-toolbar" role="toolbar" aria-label="Section formatting">
    <button type="button" data-cmd="bold" title="Bold (visual; not stored in .sec)"><strong>B</strong></button>
    <button type="button" data-cmd="italic" title="Italic (visual; not stored in .sec)"><em>I</em></button>
    <span class="wysiwyg-toolbar-sep"></span>
    <button type="button" data-cmd="pick-bracket" title="Keep the selected bracket option">Pick bracket</button>
    <button type="button" data-cmd="wrap-rid" title="Wrap selection as RID">RID</button>
    <button type="button" data-cmd="wrap-sub" title="Wrap selection as SUB">SUB</button>
    <button type="button" data-cmd="wrap-srf" title="Wrap selection as SRF">SRF</button>
    <span class="hint">Click pink brackets to keep an option · type in the body · B/I are visual-only</span>
  </div>`;
}

function unwrapFormatting(el) {
  // Flatten strong/em/b/i/u (no native SI tags) so serialize stays .sec-clean.
  const clone = el.cloneNode(true);
  clone.querySelectorAll('strong, em, b, i, u').forEach((n) => {
    const parent = n.parentNode;
    while (n.firstChild) parent.insertBefore(n.firstChild, n);
    parent.removeChild(n);
  });
  return clone;
}

function childrenFromDom(el) {
  const host = unwrapFormatting(el);
  const out = [];
  for (const child of host.childNodes) {
    if (child.nodeType === 3) {
      if (child.textContent) out.push(child.textContent);
      continue;
    }
    if (child.nodeType !== 1) continue;
    if (child.getAttribute?.('data-bracket') === '1' || child.classList?.contains('bracket')) {
      out.push(child.textContent || '');
      continue;
    }
    const tagName = (child.getAttribute('data-tag') || '').toUpperCase();
    if (tagName) {
      out.push({ tag: tagName, attrs: {}, children: childrenFromDom(child) });
      continue;
    }
    // Unknown wrapper (div/span from paste) — hoist children.
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

function selectedTextIn(rootEl) {
  const sel = rootEl.ownerDocument?.getSelection?.() || window.getSelection();
  if (!sel || !sel.rangeCount) return '';
  const range = sel.getRangeAt(0);
  if (!rootEl.contains(range.commonAncestorContainer)) return '';
  return String(sel.toString() || '').trim();
}

function wrapSelectionInline(rootEl, tagName) {
  const sel = rootEl.ownerDocument?.getSelection?.() || window.getSelection();
  if (!sel || !sel.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!rootEl.contains(range.commonAncestorContainer)) return;
  const el = rootEl.ownerDocument.createElement(tagName);
  try {
    range.surroundContents(el);
  } catch {
    const frag = range.extractContents();
    el.appendChild(frag);
    range.insertNode(el);
  }
}

/**
 * Bind toolbar + bracket clicks.
 * @param {object} hooks
 * @param {(sec: object) => void} hooks.onTreeMutated  after bracket/tag ops that require re-render
 * @param {() => object|null} hooks.getSec
 * @returns {() => void} unbind
 */
export function bindWysiwyg(toolbarEl, rootEl, hooks = {}) {
  if (!toolbarEl || !rootEl) return () => {};

  const onToolbar = (ev) => {
    const btn = ev.target.closest('[data-cmd]');
    if (!btn || !toolbarEl.contains(btn)) return;
    ev.preventDefault();
    const cmd = btn.getAttribute('data-cmd');
    const sec = hooks.getSec?.() || null;

    if (cmd === 'bold' || cmd === 'italic') {
      try {
        rootEl.ownerDocument.execCommand(cmd === 'bold' ? 'bold' : 'italic', false, null);
      } catch {
        wrapSelectionInline(rootEl, cmd === 'bold' ? 'strong' : 'em');
      }
      return;
    }

    if (!sec) return;

    if (cmd === 'pick-bracket') {
      const t = selectedTextIn(rootEl).replace(/^\[|\]$/g, '');
      if (!t) return;
      applyEditableDom(rootEl, sec);
      pickBracketInTree(sec, t);
      hooks.onTreeMutated?.(sec);
      return;
    }

    if (cmd === 'wrap-rid' || cmd === 'wrap-sub' || cmd === 'wrap-srf') {
      const t = selectedTextIn(rootEl);
      if (!t) return;
      applyEditableDom(rootEl, sec);
      const tag = cmd === 'wrap-rid' ? 'RID' : cmd === 'wrap-sub' ? 'SUB' : 'SRF';
      wrapSelectionAsTag(sec, t, tag);
      hooks.onTreeMutated?.(sec);
    }
  };

  const onRootClick = (ev) => {
    const br = ev.target.closest('.bracket[data-bracket], span.bracket');
    if (!br || !rootEl.contains(br)) return;
    const sec = hooks.getSec?.();
    if (!sec) return;
    ev.preventDefault();
    const raw = (br.textContent || '').replace(/^\[|\]$/g, '');
    applyEditableDom(rootEl, sec);
    pickBracketInTree(sec, raw);
    hooks.onTreeMutated?.(sec);
  };

  toolbarEl.addEventListener('click', onToolbar);
  rootEl.addEventListener('click', onRootClick);
  return () => {
    toolbarEl.removeEventListener('click', onToolbar);
    rootEl.removeEventListener('click', onRootClick);
  };
}

export { escapeHtml };
