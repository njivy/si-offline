import { escapeHtml, renderSectionHtml } from './render.js';
import { serializeSec } from './sec/serialize.js';
import {
  findBracketGroups,
  groupSignature,
  groupContainingOption,
  applyChoiceToText,
  applyFillToText,
  applyChoiceInTree,
  applyFillInTree,
  countSignatureInJob,
} from './bracket.js';

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
 * SpecsIntact-oriented toolbar: guided bracket picker is the primary path.
 */
export function toolbarHtml() {
  return `<div class="wysiwyg-toolbar" id="wysiwyg-toolbar" role="toolbar" aria-label="Section formatting">
    <button type="button" class="primary" data-cmd="pick-options" title="Guided SpecsIntact option picker at caret">Pick options</button>
    <span class="wysiwyg-toolbar-sep"></span>
    <button type="button" data-cmd="bold" title="Bold (visual; not stored in .sec)"><strong>B</strong></button>
    <button type="button" data-cmd="italic" title="Italic (visual; not stored in .sec)"><em>I</em></button>
    <span class="wysiwyg-toolbar-sep"></span>
    <button type="button" data-cmd="wrap-rid" title="Wrap selection as RID">RID</button>
    <button type="button" data-cmd="wrap-sub" title="Wrap selection as SUB">SUB</button>
    <button type="button" data-cmd="wrap-srf" title="Wrap selection as SRF">SRF</button>
    <span class="hint">Pick options floats on the pink brackets · click a group or place caret</span>
  </div>
  <div id="bracket-picker" class="bracket-picker bp-popover" hidden role="dialog" aria-label="Pick options"></div>`;
}

function unwrapFormatting(el) {
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
    out.push(...childrenFromDom(child));
  }
  // Merge adjacent strings so consecutive SpecsIntact tokens [A][B] stay one group
  // (DOM decoration splits them into separate span nodes).
  const merged = [];
  for (const c of out) {
    if (typeof c === 'string' && merged.length && typeof merged[merged.length - 1] === 'string') {
      merged[merged.length - 1] += c;
    } else {
      merged.push(c);
    }
  }
  return merged;
}

export function applyEditableDom(rootEl, sec) {
  if (!rootEl || !sec) return sec;
  for (const el of rootEl.querySelectorAll('[data-nid][contenteditable="true"]')) {
    const node = findByNid(sec, el.getAttribute('data-nid'));
    if (node) node.children = childrenFromDom(el);
  }
  return sec;
}

/**
 * Legacy helper: unwrap a single token Job-wide if it uniquely identifies a group choice.
 * Prefer applyBracketDecision via the picker.
 */
export function pickBracketInTree(sec, rawOption) {
  const needle = String(rawOption || '').replace(/^\[|\]$/g, '');
  function walk(n) {
    if (!n || typeof n === 'string') return;
    if (Array.isArray(n.children)) {
      n.children = n.children.map((c) => {
        if (typeof c !== 'string') return c;
        const g = groupContainingOption(c, needle);
        if (!g) return c;
        // SpecsIntact: keep chosen option, drop sibling tokens in the same consecutive group.
        const applied = applyChoiceToText(c, g, [needle]);
        return applied == null ? c : applied;
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
 * Resolve the editable host + plain text + caret offset for bracket detection.
 */
function caretContext(rootEl, fromEl = null) {
  const doc = rootEl.ownerDocument;
  const sel = doc.getSelection?.() || window.getSelection();
  let host = fromEl?.closest?.('[contenteditable="true"]') || null;
  let offset = 0;
  let text = '';

  if (!host && sel && sel.rangeCount) {
    const node = sel.anchorNode;
    if (node && rootEl.contains(node)) {
      host = (node.nodeType === 1 ? node : node.parentElement)?.closest?.('[contenteditable="true"]');
    }
  }
  if (!host || !rootEl.contains(host)) return null;

  // Flatten host text the same way bracket spans appear (textContent of host).
  text = host.textContent || '';

  if (sel && sel.rangeCount && host.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(host);
    range.setEnd(sel.anchorNode, sel.anchorOffset);
    offset = range.toString().length;
  } else if (fromEl && host.contains(fromEl)) {
    const range = doc.createRange();
    range.selectNodeContents(host);
    range.setEndBefore(fromEl);
    offset = range.toString().length + 1; // inside the bracket token
  }

  return { host, text, offset, nid: host.getAttribute('data-nid') };
}

function findGroupFromBracketEl(rootEl, brEl) {
  const ctx = caretContext(rootEl, brEl);
  if (!ctx) return null;
  const sigAttr = brEl.getAttribute('data-bsig');
  let options = null;
  if (sigAttr) {
    try {
      options = JSON.parse(sigAttr);
    } catch {
      options = null;
    }
  }
  const groups = findBracketGroups(ctx.text);
  let group = null;
  if (options) {
    const sig = groupSignature(options);
    // Prefer the group overlapping caret/click that matches signature.
    group =
      groups.find((g) => groupSignature(g.options) === sig && ctx.offset >= g.start && ctx.offset <= g.end) ||
      groups.find((g) => groupSignature(g.options) === sig) ||
      null;
  }
  if (!group) {
    group = groups.find((g) => ctx.offset >= g.start && ctx.offset <= g.end) || null;
  }
  if (!group) return null;
  return {
    ...group,
    signature: groupSignature(group.options),
    nid: ctx.nid,
    hostText: ctx.text,
  };
}

function findGroupAtCaret(rootEl) {
  const ctx = caretContext(rootEl);
  if (!ctx) return null;
  const groups = findBracketGroups(ctx.text);
  const group = groups.find((g) => ctx.offset >= g.start && ctx.offset <= g.end) || null;
  if (!group) {
    // If selection is exact option text / bracket text, locate it.
    const sel = selectedTextIn(rootEl).replace(/^\[|\]$/g, '');
    if (sel) {
      const hit = groupContainingOption(ctx.text, sel);
      if (hit) {
        return { ...hit, signature: groupSignature(hit.options), nid: ctx.nid, hostText: ctx.text };
      }
    }
    return null;
  }
  return { ...group, signature: groupSignature(group.options), nid: ctx.nid, hostText: ctx.text };
}


/**
 * Clear transient anchor highlight on bracket spans.
 */
function clearBpAnchors(rootEl) {
  rootEl?.querySelectorAll?.('.bracket.bp-anchor')?.forEach((el) => el.classList.remove('bp-anchor'));
}

/**
 * Prefer a visible .bracket span for the group; fall back to editable host.
 */
function resolvePickerAnchor(rootEl, groupInfo, preferredEl = null) {
  if (preferredEl && rootEl?.contains(preferredEl)) return preferredEl;
  if (!rootEl || !groupInfo) return null;
  const sig = groupInfo.signature;
  const brackets = [...rootEl.querySelectorAll('.bracket[data-bracket], span.bracket')];
  if (sig) {
    const hit = brackets.find((b) => {
      try {
        const opts = JSON.parse(b.getAttribute('data-bsig') || 'null');
        return opts && groupSignature(opts) === sig;
      } catch {
        return false;
      }
    });
    if (hit) return hit;
  }
  if (groupInfo.nid) {
    const host = rootEl.querySelector(`[data-nid="${CSS.escape(groupInfo.nid)}"]`);
    if (host) return host;
  }
  return rootEl.querySelector('.bracket') || rootEl;
}

/**
 * Place the picker as a fixed popover next to the anchor (flip if needed).
 * Scrolls the anchor into view first for visual proximity.
 */
export function positionPickerPopover(panel, anchorEl, { preferBelow = true } = {}) {
  if (!panel || !anchorEl) return;
  panel.classList.add('bp-popover');
  panel.hidden = false;
  try {
    anchorEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch {
    try { anchorEl.scrollIntoView(true); } catch { /* ignore */ }
  }
  const place = () => {
    const r = anchorEl.getBoundingClientRect();
    // Measure after visible
    const pw = Math.min(panel.offsetWidth || 320, window.innerWidth - 16);
    const ph = panel.offsetHeight || 200;
    let top = preferBelow ? r.bottom + 10 : r.top - ph - 10;
    if (preferBelow && top + ph > window.innerHeight - 8) {
      top = Math.max(8, r.top - ph - 10);
    } else if (!preferBelow && top < 8) {
      top = Math.min(window.innerHeight - ph - 8, r.bottom + 10);
    }
    let left = r.left;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    if (left < 8) left = 8;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.style.width = '';
    // Caret arrow toward anchor
    let caret = panel.querySelector('.bp-caret');
    if (!caret) {
      caret = panel.ownerDocument.createElement('div');
      caret.className = 'bp-caret';
      caret.setAttribute('aria-hidden', 'true');
      panel.prepend(caret);
    }
    const below = top >= r.bottom - 1;
    const caretLeft = Math.min(Math.max(12, r.left + r.width / 2 - left - 6), pw - 18);
    caret.style.left = `${Math.round(caretLeft)}px`;
    if (below) {
      caret.style.top = '-6px';
      caret.style.bottom = 'auto';
      caret.style.transform = 'rotate(45deg)';
    } else {
      caret.style.top = 'auto';
      caret.style.bottom = '-6px';
      caret.style.transform = 'rotate(225deg)';
    }
  };
  place();
  requestAnimationFrame(place);
}

/**
 * Render the guided picker panel.
 * @param {HTMLElement} panel
 * @param {object} model
 */
export function renderPickerPanel(panel, model) {
  if (!panel) return;
  if (!model || !model.group) {
    panel.hidden = true;
    panel.innerHTML = '';
    panel.style.top = '';
    panel.style.left = '';
    return;
  }
  const g = model.group;
  const jobCount = model.jobCount || { total: 0, bySection: [] };
  const previewRows = (jobCount.bySection || [])
    .map((r) => `<li><code>${escapeHtml(r.number)}</code> · ${r.count} match(es)</li>`)
    .join('');

  let body;
  if (g.kind === 'fill') {
    body = `
      <p class="hint">Fill-in bracket (SpecsIntact empty / blank option). Enter the value; brackets are removed.</p>
      <div class="field"><label for="bp-fill">Value</label>
        <input id="bp-fill" type="text" value="${escapeHtml(model.fillValue || '')}" placeholder="type replacement text" />
      </div>`;
  } else if (g.kind === 'single') {
    body = `
      <p class="hint">Single bracket — keep text and remove brackets, or replace with a typed value.</p>
      <label class="bp-opt"><input type="radio" name="bp-choice" value="0" checked />
        <span>Keep <strong>${escapeHtml(g.options[0])}</strong></span></label>
      <div class="field"><label for="bp-fill">Or replace with</label>
        <input id="bp-fill" type="text" value="" placeholder="optional alternate text" />
      </div>`;
  } else {
    const opts = g.options
      .map(
        (o, i) =>
          `<label class="bp-opt"><input type="radio" name="bp-choice" value="${i}" ${i === (model.selectedIndex ?? 0) ? 'checked' : ''} />
          <span>${escapeHtml(o)}</span></label>`
      )
      .join('');
    body = `
      <p class="hint">SpecsIntact consecutive options — choose one. Unselected tokens are removed; chosen text stays without brackets.</p>
      <div class="bp-options" role="listbox" aria-label="Bracket options">${opts}</div>`;
  }

  const batchBlock =
    g.kind === 'choice' && jobCount.total > 0
      ? `<div class="bp-batch">
          <p><strong>Job-wide:</strong> this pattern appears <strong>${jobCount.total}</strong> time(s).</p>
          <ul class="bp-preview">${previewRows || '<li class="hint">No section breakdown.</li>'}</ul>
          <label class="bp-opt"><input type="checkbox" id="bp-batch" ${jobCount.total > 1 ? '' : 'disabled'} ${model.batch ? 'checked' : ''} />
            Apply this choice to all <strong>${jobCount.total}</strong> match(es) in the Job</label>
          <p class="hint">Preview counts above are before commit. Batch updates every matching section (journaled).</p>
        </div>`
      : g.kind === 'choice'
        ? `<p class="hint">No other matches of this pattern in the Job.</p>`
        : '';

  panel.hidden = false;
  panel.classList.add('bp-popover');
  panel.innerHTML = `
    <div class="bp-caret" aria-hidden="true"></div>
    <div class="bp-head">
      <strong>Pick options</strong>
      <span class="hint">${escapeHtml(g.kind)} · ${g.options.length} token(s)</span>
      <button type="button" class="bp-close" data-bp="close" title="Close">×</button>
    </div>
    ${body}
    ${batchBlock}
    <div class="bp-actions">
      <button type="button" class="primary" data-bp="apply">Apply</button>
      <button type="button" data-bp="cancel">Cancel</button>
    </div>
    ${model.error ? `<p class="status error">${escapeHtml(model.error)}</p>` : ''}
  `;
  if (model.anchorEl) {
    clearBpAnchors(model.rootEl);
    if (model.anchorEl.classList?.contains('bracket')) {
      model.anchorEl.classList.add('bp-anchor');
    }
    positionPickerPopover(panel, model.anchorEl);
  }
}

/**
 * Bind toolbar + guided bracket picker.
 * @param {object} hooks
 * @param {() => object|null} hooks.getSec
 * @param {() => object|null} hooks.getJob  job with .sections
 * @param {(sec: object) => void} hooks.onTreeMutated
 * @param {(decision: object) => void|Promise<void>} hooks.onBracketApply
 *   decision: { signature, options, choice, fillValue, batch, scope: 'here'|'job' }
 */
export function bindWysiwyg(toolbarEl, rootEl, hooks = {}) {
  if (!toolbarEl || !rootEl) return () => {};
  const panel =
    toolbarEl.parentElement?.querySelector('#bracket-picker') ||
    rootEl.ownerDocument.getElementById('bracket-picker');

  /** @type {null | { group: object, selectedIndex: number, batch: boolean, fillValue: string, jobCount: object }} */
  let pickerModel = null;

  const closePicker = () => {
    clearBpAnchors(rootEl);
    pickerModel = null;
    if (panel) {
      panel.style.top = '';
      panel.style.left = '';
    }
    renderPickerPanel(panel, null);
  };

  const openPicker = (groupInfo, preferredOptIndex = 0, preferredEl = null) => {
    if (!groupInfo) {
      if (panel) {
        const fallback =
          preferredEl ||
          toolbarEl.querySelector('[data-cmd="pick-options"]') ||
          toolbarEl;
        panel.hidden = false;
        panel.classList.add('bp-popover');
        panel.innerHTML = `<div class="bp-caret" aria-hidden="true"></div>
          <div class="bp-head"><strong>Pick options</strong>
          <button type="button" class="bp-close" data-bp="close">×</button></div>
          <p class="status error">No SpecsIntact bracket group at the caret. Click a pink bracket, or place the caret inside one.</p>
          <div class="bp-actions"><button type="button" data-bp="cancel">Close</button></div>`;
        positionPickerPopover(panel, fallback);
      }
      return;
    }
    const job = hooks.getJob?.();
    const sections = job?.sections || [];
    const jobCount = countSignatureInJob(sections, groupInfo.signature);
    const anchorEl = resolvePickerAnchor(rootEl, groupInfo, preferredEl);
    pickerModel = {
      group: groupInfo,
      selectedIndex: preferredOptIndex,
      batch: false,
      fillValue: groupInfo.kind === 'fill' ? '' : '',
      jobCount,
      error: '',
      anchorEl,
      rootEl,
    };
    renderPickerPanel(panel, pickerModel);
  };

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

    if (cmd === 'pick-options') {
      // Flush DOM → tree so host text matches what the user sees.
      if (sec) applyEditableDom(rootEl, sec);
      const info = findGroupAtCaret(rootEl);
      openPicker(info, 0, null);
      return;
    }

    if (!sec) return;

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
    ev.stopPropagation();
    applyEditableDom(rootEl, sec);
    const optIdx = Number(br.getAttribute('data-bopt') || '0') || 0;
    const info = findGroupFromBracketEl(rootEl, br);
    openPicker(info, optIdx, br);
  };

  const onPanelClick = async (ev) => {
    const t = ev.target.closest('[data-bp]');
    if (!t || !panel?.contains(t)) return;
    const action = t.getAttribute('data-bp');
    if (action === 'close' || action === 'cancel') {
      closePicker();
      return;
    }
    if (action !== 'apply' || !pickerModel) return;

    const g = pickerModel.group;
    const batchEl = panel.querySelector('#bp-batch');
    const batch = !!(batchEl && batchEl.checked && g.kind === 'choice');
    const fillEl = panel.querySelector('#bp-fill');
    const fillRaw = fillEl ? String(fillEl.value || '') : '';

    let choice = null;
    let fillValue = null;

    if (g.kind === 'fill') {
      fillValue = fillRaw;
      if (!fillValue.trim()) {
        pickerModel.error = 'Enter a fill-in value (or Cancel).';
        renderPickerPanel(panel, pickerModel);
        return;
      }
      if (/[\[\]<>]/.test(fillValue)) {
        pickerModel.error = 'Fill-in cannot contain brackets or markup (fail-closed).';
        renderPickerPanel(panel, pickerModel);
        return;
      }
    } else if (g.kind === 'single') {
      if (fillRaw.trim()) {
        fillValue = fillRaw.trim();
        if (/[\[\]<>]/.test(fillValue)) {
          pickerModel.error = 'Replacement cannot contain brackets or markup (fail-closed).';
          renderPickerPanel(panel, pickerModel);
          return;
        }
      } else {
        choice = [0];
      }
    } else {
      const checked = panel.querySelector('input[name="bp-choice"]:checked');
      const idx = checked ? Number(checked.value) : 0;
      if (!Number.isInteger(idx) || idx < 0 || idx >= g.options.length) {
        pickerModel.error = 'Select a valid option.';
        renderPickerPanel(panel, pickerModel);
        return;
      }
      choice = [idx];
    }

    const decision = {
      signature: g.signature,
      options: g.options,
      kind: g.kind,
      choice,
      fillValue,
      batch,
      jobCount: pickerModel.jobCount,
    };

    closePicker();
    await hooks.onBracketApply?.(decision);
  };

  const onReposition = () => {
    if (pickerModel?.anchorEl && panel && !panel.hidden) {
      positionPickerPopover(panel, pickerModel.anchorEl);
    }
  };

  toolbarEl.addEventListener('click', onToolbar);
  rootEl.addEventListener('click', onRootClick);
  panel?.addEventListener('click', onPanelClick);
  window.addEventListener('resize', onReposition);
  // Reposition while scrolling the main paper column
  const scrollParent = rootEl.closest('.main') || rootEl.ownerDocument;
  scrollParent.addEventListener?.('scroll', onReposition, { passive: true });

  return () => {
    toolbarEl.removeEventListener('click', onToolbar);
    rootEl.removeEventListener('click', onRootClick);
    panel?.removeEventListener('click', onPanelClick);
    window.removeEventListener('resize', onReposition);
    scrollParent.removeEventListener?.('scroll', onReposition);
    closePicker();
  };
}

export {
  findBracketGroups,
  groupSignature,
  applyChoiceInTree,
  applyFillInTree,
  countSignatureInJob,
  applyChoiceToText,
  applyFillToText,
};
export { escapeHtml };
