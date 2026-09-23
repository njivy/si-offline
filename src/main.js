import './style.css';
import { loadJobFromZipBuffer, loadJobFromSecFiles, buildJobZip } from './pack.js';
import { escapeHtml } from './render.js';
import { runQc, summarizeFindings } from './qc/index.js';
import { originLabel, updateCurrentHash } from './lineage.js';
import { hashSecText } from './sec/hash.js';
import { parseSec } from './sec/parse.js';
import sampleJobUrl from './fixtures/job-minimal.js';
import { appendOp, textEditOp } from './journal.js';
import {
  renderEditableHtml,
  toolbarHtml,
  applyEditableDom,
  serializeFromTree,
  bindWysiwyg,
  applyChoiceInTree,
  applyFillInTree,
} from './wysiwyg.js';

const SAMPLE = sampleJobUrl;
const app = document.querySelector('#app');
const APP_VERSION = '0.4.1';

let state = {
  view: 'home',
  job: null,
  selected: null,
  findings: [],
  /** @type {null | object} finding currently jumped-to / highlighted in the body */
  qcFocus: null,
  status: '',
  error: '',
  authorName: localStorage.getItem('si-offline-author') || '',
  rationale: '',
  showNotes: true,
  showRaw: false,
};

let unbindWy = null;

function setStatus(msg, isError = false) {
  state.status = msg || '';
  state.error = isError ? msg : '';
  render();
}

function chipClass(kind) {
  if (kind === 'ufgs-master' || kind === 'agency-master') return 'master';
  if (kind === 'prior-job') return 'prior';
  return 'imported';
}

function selectedSection() {
  if (!state.job || !state.selected) return null;
  return state.job.sections.find((s) => s.number === state.selected) || null;
}


/**
 * Locate the DOM node for a QC finding inside the WYSIWYG paper.
 * Prefer tag/snippet locators already produced by fail-closed QC rules.
 */
function findQcTarget(rootEl, finding) {
  if (!rootEl || !finding) return null;
  const loc = finding.locator || {};
  const snippet = String(loc.snippet || '').trim();
  const rid = String(loc.rid || '').trim();
  const cited = String(loc.cited || '').trim();
  const tag = String(loc.tag || '').toUpperCase();

  if (tag === 'RID' && rid) {
    const hit = [...rootEl.querySelectorAll('.tag.rid, [data-tag="RID"]')].find(
      (el) => (el.textContent || '').replace(/\s+/g, ' ').trim() === rid
    );
    if (hit) return hit;
  }
  if (tag === 'SRF' && cited) {
    const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/^SECTION\s+/i, '');
    const want = norm(cited);
    const hit = [...rootEl.querySelectorAll('.tag.srf, [data-tag="SRF"]')].find((el) => {
      const t = norm(el.textContent);
      return t === want || t.includes(want) || want.includes(t);
    });
    if (hit) return hit;
  }
  if (snippet) {
    const brackets = [...rootEl.querySelectorAll('.bracket[data-bracket], span.bracket')];
    const exact = brackets.find((b) => (b.textContent || '') === snippet);
    if (exact) return exact;
    const soft = brackets.find((b) => (b.textContent || '').includes(snippet.replace(/^\[|\]$/g, '').slice(0, 40)));
    if (soft) return soft;
  }
  // Fallback: first text match in paper
  const needle = snippet || rid || cited || '';
  if (needle) {
    const walker = rootEl.ownerDocument.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if ((node.textContent || '').includes(needle.slice(0, 48))) {
        return node.parentElement || rootEl;
      }
    }
  }
  return null;
}

function clearQcHits(rootEl) {
  rootEl?.querySelectorAll?.('.qc-hit')?.forEach((el) => el.classList.remove('qc-hit'));
}

/**
 * Mark every finding that belongs to the open section with an inline badge.
 */
function decorateQcMarks(rootEl, findings, sectionNumber) {
  if (!rootEl) return;
  rootEl.querySelectorAll('.qc-mark').forEach((el) => {
    el.classList.remove('qc-mark');
    el.removeAttribute('data-qc-id');
    el.removeAttribute('data-qc-badge');
  });
  const mine = (findings || []).filter((f) => f.section === sectionNumber);
  for (const f of mine) {
    const el = findQcTarget(rootEl, f);
    if (!el) continue;
    el.classList.add('qc-mark');
    el.setAttribute('data-qc-id', f.findingId || f.code || '');
    el.setAttribute('data-qc-badge', (f.code || 'QC').split('.').pop().slice(0, 8));
  }
}

/**
 * Position a small anchored detail card next to the offending span.
 */
function positionQcAnchor(panel, anchorEl) {
  if (!panel || !anchorEl) return;
  panel.hidden = false;
  try {
    anchorEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch {
    try { anchorEl.scrollIntoView(true); } catch { /* ignore */ }
  }
  const place = () => {
    const r = anchorEl.getBoundingClientRect();
    const pw = Math.min(panel.offsetWidth || 300, window.innerWidth - 16);
    const ph = panel.offsetHeight || 120;
    let top = r.bottom + 10;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 10);
    let left = r.left;
    if (left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
    if (left < 8) left = 8;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
  };
  place();
  requestAnimationFrame(place);
}

function renderQcAnchor(panel, finding) {
  if (!panel) return;
  if (!finding) {
    panel.hidden = true;
    panel.innerHTML = '';
    return;
  }
  const snip = finding.locator?.snippet || finding.locator?.rid || finding.locator?.cited || '';
  panel.innerHTML = `
    <div class="qa-head">
      <span class="qa-code">${escapeHtml(finding.code || '')}</span>
      <span class="hint">${escapeHtml(finding.severity || '')}</span>
      <button type="button" class="qa-close" data-qa="close" title="Close">×</button>
    </div>
    <p><strong>${escapeHtml(finding.section || '')}</strong> — ${escapeHtml(finding.message || '')}</p>
    ${snip ? `<p class="hint"><code>${escapeHtml(String(snip).slice(0, 80))}</code></p>` : ''}
    ${finding.fixHint ? `<p class="hint">${escapeHtml(finding.fixHint)}</p>` : ''}
  `;
}

/**
 * Scroll + highlight the offending span and show anchored QC detail.
 */
function applyQcFocus(rootEl, finding) {
  const panel = document.getElementById('qc-anchor');
  clearQcHits(rootEl);
  if (!finding || !rootEl) {
    renderQcAnchor(panel, null);
    return null;
  }
  const target = findQcTarget(rootEl, finding);
  if (!target) {
    renderQcAnchor(panel, finding);
    if (panel) {
      // Still show detail near paper top-left if we can't resolve a span
      panel.style.top = '120px';
      panel.style.left = '340px';
      panel.hidden = false;
    }
    return null;
  }
  target.classList.add('qc-hit');
  renderQcAnchor(panel, finding);
  positionQcAnchor(panel, target);
  return target;
}


function runJobQc() {
  if (!state.job) return;
  state.findings = runQc(state.job.sections.map((s) => s.parsed));
}

async function ingestJob(job) {
  state.job = job;
  state.selected = job.sections[0]?.number || null;
  runJobQc();
  state.view = 'job';
  state.error = '';
  const n = job.sections.length;
  const q = summarizeFindings(state.findings);
  state.status = `Opened ${n} section(s) · ${q.errors} QC error(s)`;
  render();
}

async function importZipFile(file, asMaster = false) {
  state.status = `Importing ${file.name}…`;
  state.error = '';
  render();
  try {
    const job = await loadJobFromZipBuffer(await file.arrayBuffer(), {
      asMaster,
      sourceLabel: file.name,
    });
    await ingestJob(job);
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
}

async function importSecFiles(fileList) {
  try {
    const job = await loadJobFromSecFiles([...fileList], { sourceLabel: 'local .sec' });
    await ingestJob(job);
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
}

async function loadSample() {
  state.status = 'Fetching fixture Job…';
  render();
  try {
    const res = await fetch(SAMPLE);
    if (!res.ok) throw new Error(`Failed to fetch fixture: ${res.status}`);
    const blob = await res.blob();
    const file = new File([blob], 'job-minimal.zip', { type: 'application/zip' });
    await importZipFile(file, true);
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
}

async function exportJob() {
  if (!state.job) return;
  try {
    await flushInlineToSection(false);
    state.job.qc = state.findings;
    const blob = await buildJobZip(state.job);
    const name = `${(state.job.job.name || 'job').replace(/\s+/g, '-')}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    state.status = `Exported ${name}`;
    render();
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
}

/**
 * Pull contenteditable DOM into sec.parsed / sec.text without journal (or with).
 * @param {boolean} journal  if true, append journal entry when bytes change
 */
async function flushInlineToSection(journal = true) {
  const sec = selectedSection();
  if (!sec) return false;
  const root = document.getElementById('wysiwyg-root');
  if (!root) return false;

  state.authorName = document.getElementById('author-name')?.value ?? state.authorName;
  state.rationale = document.getElementById('edit-rationale')?.value ?? state.rationale;
  localStorage.setItem('si-offline-author', state.authorName || '');

  applyEditableDom(root, sec.parsed);
  const stl = (sec.parsed.children || []).find((c) => c && c.tag === 'STL');
  if (stl) {
    const t = (stl.children || []).map((c) => (typeof c === 'string' ? c : '')).join('');
    if (t) sec.title = t;
  }
  sec.parsed.number = sec.parsed.number || sec.number;
  sec.parsed.title = sec.title;

  const next = serializeFromTree(sec.parsed);
  const beforeHash = sec.hash;
  const afterHash = await hashSecText(next);
  if (beforeHash === afterHash) {
    if (journal) setStatus('No byte change.');
    return false;
  }

  sec.text = next;
  sec.hash = afterHash;
  sec.parsed = parseSec(next);
  sec.parsed.number = sec.parsed.number || sec.number;
  sec.title = sec.parsed.title || sec.title;
  sec.lineage = updateCurrentHash(sec.lineage, afterHash);

  if (journal) {
    const author = { displayName: state.authorName || 'unspecified', id: null };
    sec.journal = appendOp(
      sec.journal,
      textEditOp({
        author,
        beforeHash,
        afterHash,
        beforeSnippet: '',
        afterSnippet: '',
        rationale: (state.rationale || '').trim() || null,
      })
    );
  }

  runJobQc();
  if (journal) state.status = `Saved ${sec.number} · ${afterHash.slice(0, 18)}…`;
  return true;
}

async function saveInlineEdit() {
  const changed = await flushInlineToSection(true);
  if (changed) render();
}

async function saveRawFallback() {
  const sec = selectedSection();
  if (!sec) return;
  const ta = document.getElementById('raw-sec');
  if (!ta) return;
  const next = ta.value;
  const rationale = (document.getElementById('edit-rationale')?.value || '').trim();
  state.authorName = document.getElementById('author-name')?.value ?? state.authorName;
  localStorage.setItem('si-offline-author', state.authorName || '');
  const beforeHash = sec.hash;
  const afterHash = await hashSecText(next);
  if (beforeHash === afterHash) {
    setStatus('No byte change.');
    return;
  }
  sec.text = next;
  sec.hash = afterHash;
  sec.parsed = parseSec(next);
  sec.parsed.number = sec.parsed.number || sec.number;
  sec.title = sec.parsed.title || sec.title;
  sec.lineage = updateCurrentHash(sec.lineage, afterHash);
  const author = { displayName: state.authorName || 'unspecified', id: null };
  sec.journal = appendOp(
    sec.journal,
    textEditOp({
      author,
      beforeHash,
      afterHash,
      beforeSnippet: '',
      afterSnippet: '',
      rationale: rationale || null,
    })
  );
  runJobQc();
  state.status = `Saved ${sec.number} (raw) · ${afterHash.slice(0, 18)}…`;
  render();
}

function onTreeMutated(secTree) {
  const sec = selectedSection();
  if (!sec) return;
  sec.parsed = secTree;
  try {
    sec.text = serializeFromTree(secTree);
  } catch {
    /* keep prior text */
  }
  runJobQc();
  render();
}

/**
 * Persist a section tree to bytes + optional journal.
 */
async function commitSectionTree(sec, rationale, { journal = true } = {}) {
  const next = serializeFromTree(sec.parsed);
  const beforeHash = sec.hash;
  const afterHash = await hashSecText(next);
  sec.text = next;
  sec.hash = afterHash;
  sec.parsed = parseSec(next);
  sec.parsed.number = sec.parsed.number || sec.number;
  sec.title = sec.parsed.title || sec.title;
  sec.lineage = updateCurrentHash(sec.lineage, afterHash);
  if (journal && beforeHash !== afterHash) {
    const author = { displayName: state.authorName || 'unspecified', id: null };
    sec.journal = appendOp(
      sec.journal,
      textEditOp({
        author,
        beforeHash,
        afterHash,
        beforeSnippet: '',
        afterSnippet: '',
        rationale: rationale || null,
      })
    );
  }
  return beforeHash !== afterHash;
}

/**
 * Guided picker apply — local or Job-wide batch (SpecsIntact-safe consecutive groups).
 */
async function onBracketApply(decision) {
  if (!state.job || !decision) return;
  const root = document.getElementById('wysiwyg-root');
  const current = selectedSection();
  if (current && root) applyEditableDom(root, current.parsed);

  const label =
    decision.fillValue != null
      ? `fill → "${decision.fillValue}"`
      : `keep "${decision.options[decision.choice[0]]}"`;
  const rationaleBase = `Bracket pick: ${label} · pattern ${decision.options.map((o) => `[${o}]`).join('')}`;

  let totalHits = 0;
  const touched = [];

  const targets = decision.batch
    ? state.job.sections
    : current
      ? [current]
      : [];

  for (const sec of targets) {
    let n = 0;
    if (decision.fillValue != null) {
      n = applyFillInTree(sec.parsed, decision.signature, decision.fillValue, { all: true });
    } else {
      n = applyChoiceInTree(sec.parsed, decision.signature, decision.choice, { all: true });
    }
    if (!n) continue;
    totalHits += n;
    const why = decision.batch
      ? `${rationaleBase} · Job-wide batch (${decision.jobCount?.total || '?'} previewed)`
      : rationaleBase;
    const changed = await commitSectionTree(sec, why, { journal: true });
    if (changed) touched.push(sec.number);
  }

  runJobQc();
  if (!totalHits) {
    state.status = 'No safe bracket match to apply (fail-closed).';
  } else if (decision.batch) {
    state.status = `Applied bracket choice Job-wide · ${totalHits} match(es) in ${touched.length} section(s): ${touched.join(', ')}`;
  } else {
    state.status = `Applied bracket choice here · ${totalHits} match(es). Save already journaled.`;
  }
  render();
}

function renderHome() {
  return `
    <div class="proposal-banner">
      Offline SI — <strong>.sec files</strong> are the source of truth. No CMS. Not contractual Process &amp; Print.
    </div>
    <header class="topbar">
      <h1>Offline SI</h1>
      <span class="meta">v${APP_VERSION} · guided bracket picker</span>
    </header>
    <main class="main">
      <div class="card">
        <h3>Open a Job of .sec files</h3>
        <p class="hint">Import a ZIP of sections or loose <code>.sec</code> files. Edit inline; use <strong>Pick options</strong> for SpecsIntact brackets (with Job-wide batch).</p>
        <div class="home-actions">
          <label class="btn primary file-btn">Import Job ZIP<input type="file" id="file-zip" accept=".zip,application/zip" /></label>
          <label class="btn file-btn">Import .sec files<input type="file" id="file-sec" accept=".sec,.xml,text/xml" multiple /></label>
          <button type="button" class="primary" id="btn-sample">Load fixture Job</button>
        </div>
        ${state.error ? `<p class="status error">${escapeHtml(state.error)}</p>` : ''}
        ${state.status && !state.error ? `<p class="status">${escapeHtml(state.status)}</p>` : ''}
      </div>
    </main>
  `;
}

function renderJob() {
  const job = state.job;
  const sec = selectedSection();
  const q = summarizeFindings(state.findings);
  const rows = job.sections
    .map((s) => {
      const kind = s.lineage?.origin?.kind || 'imported-sec';
      const active = s.number === state.selected ? 'active' : '';
      const nFind = state.findings.filter((f) => f.section === s.number).length;
      return `<li><div class="toc-row ${active}" data-sec="${escapeHtml(s.number)}">
      <span class="toc-num">${escapeHtml(s.number)}</span>
      <span class="toc-title">${escapeHtml(s.title || '')}</span>
      <span class="chip ${chipClass(kind)}">${escapeHtml(originLabel(s.lineage?.origin))}</span>
      ${nFind ? `<span class="hint">${nFind} finding(s)</span>` : ''}
    </div></li>`;
    })
    .join('');
  const findings = state.findings
    .map((f) => {
      const snip = f.locator?.snippet || f.locator?.rid || f.locator?.cited || '';
      const active = state.qcFocus && state.qcFocus.findingId === f.findingId ? 'active' : '';
      return `<div class="finding ${escapeHtml(f.severity)} ${active}" data-jump="${escapeHtml(f.section)}" data-fid="${escapeHtml(f.findingId || '')}">
    <div class="code">${escapeHtml(f.code)}</div>
    <p><strong>${escapeHtml(f.section)}</strong> — ${escapeHtml(f.message)}</p>
    ${snip ? `<span class="snippet">${escapeHtml(String(snip).slice(0, 80))}</span>` : ''}
  </div>`;
    })
    .join('');
  const origin = sec?.lineage?.origin;
  const paper = sec
    ? renderEditableHtml(sec.parsed)
    : '<p class="hint">Select a section.</p>';

  return `
    <div class="proposal-banner">Offline SI — working files only. Process &amp; Print remains official SpecsIntact. <strong>Pick options</strong> for brackets.</div>
    <header class="topbar">
      <h1>Offline SI</h1>
      <span class="meta">${escapeHtml(job.job.name || '')} · ${job.sections.length} sections · ${q.errors} QC errors · v${APP_VERSION}</span>
      <button type="button" id="btn-home">Close Job</button>
      <button type="button" class="primary" id="btn-export">Export Job ZIP</button>
    </header>
    <div class="layout">
      <aside class="sidebar"><h2>Sections</h2><ul class="section-list">${rows}</ul></aside>
      <main class="main">
        ${state.error ? `<p class="status error">${escapeHtml(state.error)}</p>` : ''}
        ${state.status && !state.error ? `<p class="status">${escapeHtml(state.status)}</p>` : ''}
        ${
          sec
            ? `<div class="card section-card">
          <h3>${escapeHtml(sec.number)} ${escapeHtml(sec.title || '')}</h3>
          <p class="meta-line">Origin: <span class="chip ${chipClass(origin?.kind)}">${escapeHtml(originLabel(origin))}</span> · hash <code>${escapeHtml(sec.hash)}</code></p>
          <p class="meta-line">Journal entries: ${sec.journal?.entries?.length || 0}</p>
          <div class="edit-meta">
            <div class="field inline"><label for="author-name">Author</label><input id="author-name" value="${escapeHtml(state.authorName)}" placeholder="display name" /></div>
            <div class="field inline grow"><label for="edit-rationale">Rationale</label><input id="edit-rationale" value="${escapeHtml(state.rationale)}" placeholder="optional save note" /></div>
            <button type="button" class="primary" id="btn-save">Save section + journal</button>
          </div>
          ${toolbarHtml()}
          <div class="paper wysiwyg-surface" data-mode="edit" id="wysiwyg-root">${paper}</div>
          <details class="raw-fallback" ${state.showRaw ? 'open' : ''}>
            <summary>Advanced: raw .sec source</summary>
            <p class="hint">Primary editing is inline above. Raw source is a fallback for tags that are not contenteditable hosts (structure, SCN, REF shells, tables).</p>
            <div class="field"><label for="raw-sec">Section source</label><textarea id="raw-sec" class="raw-sec">${escapeHtml(sec.text)}</textarea></div>
            <div class="actions"><button type="button" id="btn-save-raw">Save raw + journal</button></div>
          </details>
        </div>`
            : ''
        }
      </main>
      <aside class="qc-pane"><h2>QC · ${q.total}</h2>
        <p class="hint">Click a finding to jump and highlight it in the section body.</p>
        ${findings || '<p class="hint">No findings.</p>'}
      </aside>
    </div>
    <div id="qc-anchor" class="qc-anchor" hidden role="dialog" aria-label="QC finding"></div>`;
}

function render() {
  if (typeof unbindWy === 'function') {
    unbindWy();
    unbindWy = null;
  }
  app.innerHTML = state.view === 'job' && state.job ? renderJob() : renderHome();
  bind();
}

function bind() {
  document.getElementById('file-zip')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) importZipFile(f, false);
  });
  document.getElementById('file-sec')?.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files?.length) importSecFiles(files);
  });
  document.getElementById('btn-sample')?.addEventListener('click', loadSample);
  document.getElementById('btn-home')?.addEventListener('click', () => {
    state.view = 'home';
    state.job = null;
    state.findings = [];
    state.qcFocus = null;
    render();
  });
  document.getElementById('btn-export')?.addEventListener('click', exportJob);
  document.getElementById('btn-save')?.addEventListener('click', saveInlineEdit);
  document.getElementById('btn-save-raw')?.addEventListener('click', saveRawFallback);
  document.getElementById('author-name')?.addEventListener('change', (e) => {
    state.authorName = e.target.value;
    localStorage.setItem('si-offline-author', state.authorName);
  });
  document.getElementById('edit-rationale')?.addEventListener('input', (e) => {
    state.rationale = e.target.value;
  });
  document.querySelector('details.raw-fallback')?.addEventListener('toggle', (e) => {
    state.showRaw = e.target.open;
  });
  document.querySelectorAll('.toc-row[data-sec]').forEach((el) => {
    el.addEventListener('click', async () => {
      await flushInlineToSection(false);
      state.selected = el.getAttribute('data-sec');
      render();
    });
  });
  document.querySelectorAll('.finding[data-jump]').forEach((el) => {
    el.addEventListener('click', async () => {
      await flushInlineToSection(false);
      const fid = el.getAttribute('data-fid');
      const secNum = el.getAttribute('data-jump');
      const finding =
        state.findings.find((f) => f.findingId === fid) ||
        state.findings.find((f) => f.section === secNum && el.textContent?.includes(f.code));
      state.selected = secNum;
      state.qcFocus = finding || null;
      render();
    });
  });

  document.getElementById('qc-anchor')?.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-qa="close"]')) {
      state.qcFocus = null;
      const panel = document.getElementById('qc-anchor');
      renderQcAnchor(panel, null);
      clearQcHits(document.getElementById('wysiwyg-root'));
      document.querySelectorAll('.finding.active').forEach((f) => f.classList.remove('active'));
    }
  });

  const root = document.getElementById('wysiwyg-root');
  const toolbar = document.getElementById('wysiwyg-toolbar');
  if (root && toolbar) {
    unbindWy = bindWysiwyg(toolbar, root, {
      getSec: () => selectedSection()?.parsed || null,
      getJob: () => state.job,
      onTreeMutated,
      onBracketApply,
    });
  }

  // Inline QC marks + jump/highlight for the open section
  if (root && state.selected) {
    decorateQcMarks(root, state.findings, state.selected);
    if (state.qcFocus && state.qcFocus.section === state.selected) {
      applyQcFocus(root, state.qcFocus);
    } else if (state.qcFocus && state.qcFocus.section !== state.selected) {
      // Section switched away — keep list selection but clear body highlight
      renderQcAnchor(document.getElementById('qc-anchor'), null);
    }
  }

  // Clicking an inline QC mark focuses that finding
  root?.querySelectorAll('.qc-mark[data-qc-id]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      // Don't steal bracket picker clicks — only when not a bracket open intent
      const fid = el.getAttribute('data-qc-id');
      const finding = state.findings.find((f) => f.findingId === fid);
      if (!finding) return;
      // Allow bracket picker to also open; still show QC anchor for non-bracket marks
      if (el.classList.contains('bracket')) return;
      ev.stopPropagation();
      state.qcFocus = finding;
      applyQcFocus(root, finding);
      document.querySelectorAll('.finding.active').forEach((f) => f.classList.remove('active'));
      document.querySelector(`.finding[data-fid="${CSS.escape(fid)}"]`)?.classList.add('active');
    });
  });
}

render();
