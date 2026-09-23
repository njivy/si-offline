import './style.css';
import { loadJobFromZipBuffer, loadJobFromSecFiles, buildJobZip } from './pack.js';
import { escapeHtml } from './render.js';
import { runQc, summarizeFindings, exportBlockingFindings } from './qc/index.js';
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
import {
  saveMastersLibrary,
  loadMastersLibrary,
  libraryFromJob,
  findInLibrary,
  compareTexts,
} from './masters.js';
import { buildJobChangelog, changelogToHtml, changelogToMarkdown } from './changelog.js';
import { searchJob, previewReplace } from './find.js';
import {
  getSectionStatus,
  setSectionStatus,
  insertSectionFromLibrary,
  SECTION_STATUSES,
} from './outline.js';
import { lineageFromImport } from './lineage.js';
import { emptyJournal, pullOriginOp } from './journal.js';

const SAMPLE = sampleJobUrl;
const app = document.querySelector('#app');
const APP_VERSION = '0.5.0';

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
  /** @type {null | object} offline masters library */
  mastersLib: null,
  findQuery: '',
  findFilter: 'text',
  findHits: [],
  findPreview: null,
  modal: null, // 'find' | 'masters' | 'compare' | 'structure' | null
  exportOverride: false,
  compareResult: null,
  mastersLib: null,
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
 * Scroll + highlight the offending span and show anchored QC detail.
 */
function applyQcFocus(rootEl, finding) {
  clearQcHits(rootEl);
  if (!finding || !rootEl) return null;
  const target = findQcTarget(rootEl, finding);
  if (!target) return null;
  target.classList.add('qc-hit');
  try {
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } catch {
    try { target.scrollIntoView(true); } catch { /* ignore */ }
  }
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
    runJobQc();
    const blocking = exportBlockingFindings(state.findings);
    if (blocking.length && !state.exportOverride) {
      state.status = '';
      state.error = `Export blocked: ${blocking.length} QC error(s). Fix findings (jump from the QC sidebar) or confirm override.`;
      state.modal = 'export-gate';
      render();
      return;
    }
    state.job.qc = state.findings;
    if (!state.job.outline) state.job.outline = { statuses: {} };
    const changelog = buildJobChangelog(state.job);
    state.job.changelog = changelog;
    state.job.changelogHtml = changelogToHtml(changelog);
    state.job.changelogMd = changelogToMarkdown(changelog);
    const blob = await buildJobZip(state.job);
    const name = `${(state.job.job.name || 'job').replace(/\s+/g, '-')}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    state.exportOverride = false;
    state.modal = null;
    state.error = '';
    state.status = blocking.length
      ? `Exported ${name} (QC override — ${blocking.length} error(s) recorded in qc.json)`
      : `Exported ${name}`;
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
      const st = getSectionStatus(job, s.number);
      return `<li><div class="toc-row ${active}" data-sec="${escapeHtml(s.number)}">
      <span class="toc-num">${escapeHtml(s.number)}</span>
      <span class="toc-title">${escapeHtml(s.title || '')}</span>
      <span class="chip ${chipClass(kind)}">${escapeHtml(originLabel(s.lineage?.origin))}</span>
      <span class="chip status-${escapeHtml(st)}" title="Outline status (sidecar only)">${escapeHtml(st)}</span>
      ${nFind ? `<span class="hint">${nFind} finding(s)</span>` : ''}
      <span class="toc-actions">
        <button type="button" class="linkish" data-status-cycle="${escapeHtml(s.number)}" title="Cycle done / needs-SME / working">Status</button>
        <button type="button" class="linkish" data-compare="${escapeHtml(s.number)}" title="Compare to masters library">Compare</button>
      </span>
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
      <button type="button" id="btn-find">Find</button>
      <button type="button" id="btn-masters">Masters</button>
      <button type="button" id="btn-changelog">Change log</button>
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
          <p class="meta-line">Journal entries: ${sec.journal?.entries?.length || 0}
            · Outline: <strong>${escapeHtml(getSectionStatus(job, sec.number))}</strong>
            · Masters: ${state.mastersLib ? escapeHtml(state.mastersLib.label) + ` (${state.mastersLib.sections.length})` : 'none loaded'}
          </p>
          <div class="structure-panel card-lite">
            <h4>Structure (SpecsIntact-safe)</h4>
            <p class="hint">PRT/SPT titles edit inline. Add a REF (RID+RTL) to the References article without inventing markup.</p>
            <div class="edit-meta">
              <div class="field inline"><label for="ref-rid">RID</label><input id="ref-rid" placeholder="e.g. ACI 318" /></div>
              <div class="field inline grow"><label for="ref-rtl">RTL</label><input id="ref-rtl" placeholder="title" /></div>
              <button type="button" id="btn-add-ref">Add REF</button>
            </div>
            <p class="hint">Tables (TAB): cell text is editable when present; new table shapes stay in Advanced raw (fail-closed — no invented table markup).</p>
          </div>
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
        <p class="hint">Click a finding to jump and highlight it in the section body. Detail stays in this sidebar (once).</p>
        ${findings || '<p class="hint">No findings.</p>'}
      </aside>
    </div>
    ${renderModal()}`;
}


function renderModal() {
  if (!state.modal) return '';
  if (state.modal === 'export-gate') {
    const blocking = exportBlockingFindings(state.findings);
    const list = blocking
      .slice(0, 12)
      .map((f) => `<li><button type="button" class="linkish" data-jump="${escapeHtml(f.section)}" data-fid="${escapeHtml(f.findingId || '')}"><code>${escapeHtml(f.code)}</code> ${escapeHtml(f.section)} — ${escapeHtml(f.message)}</button></li>`)
      .join('');
    return `<div class="modal-backdrop" id="modal-root" role="dialog" aria-label="Export blocked">
      <div class="modal">
        <h3>Export blocked by QC</h3>
        <p class="hint">Fail-closed: remaining brackets, unresolved RID/SRF, unmatched tags, or illegal nests must be fixed — or explicitly overridden.</p>
        <ul class="modal-list">${list || '<li>No details</li>'}</ul>
        <div class="actions">
          <button type="button" id="btn-export-cancel">Cancel</button>
          <button type="button" class="danger" id="btn-export-override">Export anyway (record QC in zip)</button>
        </div>
      </div>
    </div>`;
  }
  if (state.modal === 'find') {
    const hits = (state.findHits || [])
      .slice(0, 40)
      .map((h) => `<li><button type="button" class="linkish" data-find-jump="${escapeHtml(h.section)}"><code>${escapeHtml(h.section)}</code> [${escapeHtml(h.kind)}] ${escapeHtml(h.snippet || '')}</button></li>`)
      .join('');
    const prev = state.findPreview;
    return `<div class="modal-backdrop" id="modal-root" role="dialog" aria-label="Find">
      <div class="modal wide">
        <h3>Find <span class="hint">(tag-aware · replace previews fail-closed)</span></h3>
        <div class="edit-meta">
          <div class="field inline grow"><label for="find-q">Query</label><input id="find-q" value="${escapeHtml(state.findQuery)}" /></div>
          <div class="field inline"><label for="find-filter">Filter</label>
            <select id="find-filter">
              <option value="text" ${state.findFilter==='text'?'selected':''}>Plain text</option>
              <option value="open_brackets" ${state.findFilter==='open_brackets'?'selected':''}>Open brackets</option>
              <option value="unresolved_rid" ${state.findFilter==='unresolved_rid'?'selected':''}>Unresolved RID</option>
              <option value="notes" ${state.findFilter==='notes'?'selected':''}>Notes (NTE/NPR)</option>
            </select>
          </div>
          <button type="button" class="primary" id="btn-find-go">Search</button>
        </div>
        <div class="edit-meta">
          <div class="field inline grow"><label for="find-rep">Replace with</label><input id="find-rep" placeholder="no &lt; &gt; allowed" /></div>
          <button type="button" id="btn-find-preview">Preview replace</button>
          <button type="button" class="primary" id="btn-find-apply" ${prev && prev.ok ? '' : 'disabled'}>Apply replace</button>
        </div>
        ${prev && !prev.ok ? `<p class="status error">${escapeHtml(prev.reason || 'Blocked')}</p>` : ''}
        ${prev && prev.ok ? `<p class="hint">Preview: ${prev.previews.length} section(s), ${prev.previews.reduce((n,p)=>n+p.count,0)} replacement(s).</p>` : ''}
        <ul class="modal-list">${hits || '<li class="hint">No hits yet.</li>'}</ul>
        <div class="actions"><button type="button" id="btn-modal-close">Close</button></div>
      </div>
    </div>`;
  }
  if (state.modal === 'masters') {
    const lib = state.mastersLib;
    const rows = (lib?.sections || [])
      .map((s) => {
        const inJob = state.job?.sections?.some((j) => j.number === s.number);
        return `<li><code>${escapeHtml(s.number)}</code> ${escapeHtml(s.title || '')}
          ${inJob ? '<span class="hint">already in Job</span>' : `<button type="button" class="linkish" data-insert-master="${escapeHtml(s.number)}">Insert into Job</button>`}
        </li>`;
      })
      .join('');
    return `<div class="modal-backdrop" id="modal-root" role="dialog" aria-label="Masters library">
      <div class="modal wide">
        <h3>Masters / prior Job library</h3>
        <p class="hint">Drop a ZIP of masters or a prior Job once. Indexed offline for insert-section and compare. No network.</p>
        <label class="btn file-btn">Import masters ZIP<input type="file" id="file-masters" accept=".zip,application/zip" /></label>
        ${lib ? `<p class="meta-line">Loaded: <strong>${escapeHtml(lib.label)}</strong> · ${lib.sections.length} section(s) · ${escapeHtml(lib.importedAt || '')}</p>` : '<p class="hint">No library loaded.</p>'}
        <ul class="modal-list">${rows || ''}</ul>
        <div class="actions"><button type="button" id="btn-modal-close">Close</button></div>
      </div>
    </div>`;
  }
  if (state.modal === 'compare') {
    const cmp = state.compareResult;
    if (!cmp) return '';
    const body = (cmp.rows || [])
      .filter((r) => r.kind !== 'same')
      .slice(0, 80)
      .map((r) => `<tr class="diff-${escapeHtml(r.kind)}"><td>${r.line}</td><td><pre>${escapeHtml(r.left)}</pre></td><td><pre>${escapeHtml(r.right)}</pre></td></tr>`)
      .join('');
    return `<div class="modal-backdrop" id="modal-root" role="dialog" aria-label="Compare to master">
      <div class="modal wide">
        <h3>Compare ${escapeHtml(cmp.number)} to masters</h3>
        <p class="hint">${cmp.changed} differing line(s) of ${cmp.total}. Review only — does not rewrite .sec.</p>
        <table class="diff-table"><thead><tr><th>#</th><th>Master</th><th>Job</th></tr></thead><tbody>${body || '<tr><td colspan="3">Identical</td></tr>'}</tbody></table>
        <div class="actions"><button type="button" id="btn-modal-close">Close</button></div>
      </div>
    </div>`;
  }
  return '';
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
      // Section switched away — keep sidebar finding selection; clear body highlight only
      clearQcHits(root);
    }
  }

  // Clicking an inline QC mark focuses that finding
  root?.querySelectorAll('.qc-mark[data-qc-id]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      // Don't steal bracket picker clicks — only when not a bracket open intent
      const fid = el.getAttribute('data-qc-id');
      const finding = state.findings.find((f) => f.findingId === fid);
      if (!finding) return;
      // Allow bracket picker to also open; sidebar keeps the selected finding
      if (el.classList.contains('bracket')) return;
      ev.stopPropagation();
      state.qcFocus = finding;
      applyQcFocus(root, finding);
      document.querySelectorAll('.finding.active').forEach((f) => f.classList.remove('active'));
      document.querySelector(`.finding[data-fid="${CSS.escape(fid)}"]`)?.classList.add('active');
    });
  });


  // --- v0.5.0 feature wiring (names match imports) ---
  document.getElementById('btn-find')?.addEventListener('click', () => {
    state.modal = 'find';
    state.findHits = [];
    state.findPreview = null;
    render();
  });
  document.getElementById('btn-masters')?.addEventListener('click', async () => {
    if (!state.mastersLib) state.mastersLib = await loadMastersLibrary();
    state.modal = 'masters';
    render();
  });
  document.getElementById('btn-changelog')?.addEventListener('click', () => {
    if (!state.job) return;
    const log = buildJobChangelog(state.job);
    const html = changelogToHtml(log);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.job.job.name || 'job').replace(/\s+/g, '-')}-changelog.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setStatus(`Downloaded change log (${(log.entries || []).length} entries). .sec files unchanged.`);
  });
  document.getElementById('btn-modal-close')?.addEventListener('click', () => {
    state.modal = null;
    render();
  });
  document.getElementById('btn-export-cancel')?.addEventListener('click', () => {
    state.modal = null;
    state.exportOverride = false;
    setStatus('Export cancelled — fix QC findings or override explicitly.');
  });
  document.getElementById('btn-export-override')?.addEventListener('click', async () => {
    state.exportOverride = true;
    state.modal = null;
    await exportJob();
  });
  document.querySelectorAll('#modal-root [data-jump]').forEach((el) => {
    el.addEventListener('click', async () => {
      await flushInlineToSection(false);
      const secNum = el.getAttribute('data-jump');
      const fid = el.getAttribute('data-fid');
      state.selected = secNum;
      state.qcFocus =
        state.findings.find((f) => f.findingId === fid) ||
        state.findings.find((f) => f.section === secNum) ||
        null;
      state.modal = null;
      render();
    });
  });
  document.getElementById('btn-find-go')?.addEventListener('click', () => {
    state.findQuery = document.getElementById('find-q')?.value || '';
    state.findFilter = document.getElementById('find-filter')?.value || 'text';
    state.findHits = searchJob(state.job.sections, {
      query: state.findQuery,
      tagFilter: state.findFilter,
      findings: state.findings,
    });
    state.findPreview = null;
    render();
  });
  document.getElementById('btn-find-preview')?.addEventListener('click', () => {
    state.findQuery = document.getElementById('find-q')?.value || '';
    const replacement = document.getElementById('find-rep')?.value ?? '';
    state.findPreview = previewReplace(state.job.sections, {
      query: state.findQuery,
      replacement,
    });
    render();
  });
  document.getElementById('btn-find-apply')?.addEventListener('click', async () => {
    const prev = state.findPreview;
    if (!prev?.ok) return;
    for (const p of prev.previews) {
      const sec = state.job.sections.find((s) => s.number === p.section);
      if (!sec) continue;
      const beforeHash = sec.hash;
      sec.text = p.afterFull;
      sec.parsed = parseSec(p.afterFull);
      sec.parsed._raw = p.afterFull;
      const afterHash = await hashSecText(p.afterFull);
      sec.hash = afterHash;
      sec.lineage = updateCurrentHash(sec.lineage, afterHash);
      sec.journal = appendOp(
        sec.journal,
        textEditOp({
          author: { displayName: state.authorName || 'unspecified', id: null },
          beforeHash,
          afterHash,
          rationale: `Find/replace: ${state.findQuery}`,
        })
      );
    }
    state.findPreview = null;
    state.modal = null;
    runJobQc();
    setStatus(`Applied replace in ${prev.previews.length} section(s).`);
    render();
  });
  document.querySelectorAll('[data-find-jump]').forEach((el) => {
    el.addEventListener('click', async () => {
      await flushInlineToSection(false);
      state.selected = el.getAttribute('data-find-jump');
      state.modal = null;
      render();
    });
  });
  document.getElementById('file-masters')?.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const job = await loadJobFromZipBuffer(await f.arrayBuffer(), {
        asMaster: true,
        sourceLabel: f.name,
      });
      const lib = libraryFromJob(job, f.name);
      await saveMastersLibrary(lib);
      state.mastersLib = lib;
      setStatus(`Masters library loaded: ${lib.sections.length} section(s) from ${f.name}`);
      render();
    } catch (err) {
      setStatus(err.message || String(err), true);
    }
  });
  document.querySelectorAll('[data-insert-master]').forEach((el) => {
    el.addEventListener('click', async () => {
      const num = el.getAttribute('data-insert-master');
      const libSec = findInLibrary(state.mastersLib, num);
      const result = insertSectionFromLibrary(state.job, libSec, {
        lineageFactory: lineageFromImport,
        journalFactory: emptyJournal,
        parseSec,
        hashSecText,
      });
      if (!result.ok) {
        setStatus(result.reason, true);
        return;
      }
      const sec = await result.build();
      state.job.sections.push(sec);
      state.job.sections.sort((a, b) => String(a.number).localeCompare(String(b.number)));
      state.selected = sec.number;
      state.modal = null;
      runJobQc();
      setStatus(`Inserted section ${sec.number} from masters.`);
      render();
    });
  });
  document.querySelectorAll('[data-status-cycle]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const num = el.getAttribute('data-status-cycle');
      const cur = getSectionStatus(state.job, num);
      const order = SECTION_STATUSES;
      const next = order[(Math.max(0, order.indexOf(cur)) + 1) % order.length];
      state.job = setSectionStatus(state.job, num, next);
      render();
    });
  });
  document.querySelectorAll('[data-compare]').forEach((el) => {
    el.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const num = el.getAttribute('data-compare');
      if (!state.mastersLib) state.mastersLib = await loadMastersLibrary();
      const libSec = findInLibrary(state.mastersLib, num);
      const jobSec = state.job.sections.find((s) => s.number === num);
      if (!libSec) {
        setStatus(`No masters copy of ${num}. Load a masters ZIP first.`, true);
        return;
      }
      const cmp = compareTexts(libSec.text, jobSec?.text || '');
      state.compareResult = { number: num, ...cmp };
      state.modal = 'compare';
      render();
    });
  });
  document.getElementById('btn-add-ref')?.addEventListener('click', async () => {
    const rid = (document.getElementById('ref-rid')?.value || '').trim();
    const rtl = (document.getElementById('ref-rtl')?.value || '').trim();
    if (!rid) {
      setStatus('RID is required.', true);
      return;
    }
    if (/[<>]/.test(rid + rtl)) {
      setStatus('RID/RTL cannot contain markup.', true);
      return;
    }
    const sec = selectedSection();
    if (!sec) return;
    await flushInlineToSection(false);
    const raw = sec.text;
    const refBlock = `<REF><RID>${rid}</RID>${rtl ? `<RTL>${rtl}</RTL>` : ''}</REF>`;
    let next = raw;
    if (/<SPT>[\s\S]*?<TTL>REFERENCES<\/TTL>/i.test(raw)) {
      next = raw.replace(
        /(<SPT>[\s\S]*?<TTL>REFERENCES<\/TTL>)([\s\S]*?)(<\/SPT>)/i,
        (_m, a, mid, c) => `${a}${mid}${refBlock}${c}`
      );
    } else {
      setStatus('No SPT REFERENCES host found — refuse to invent structure (fail-closed).', true);
      return;
    }
    if (next === raw) {
      setStatus('Could not locate a safe REFERENCES insertion point.', true);
      return;
    }
    const beforeHash = sec.hash;
    sec.text = next;
    sec.parsed = parseSec(next);
    sec.parsed._raw = next;
    const afterHash = await hashSecText(next);
    sec.hash = afterHash;
    sec.lineage = updateCurrentHash(sec.lineage, afterHash);
    sec.journal = appendOp(
      sec.journal,
      textEditOp({
        author: { displayName: state.authorName || 'unspecified', id: null },
        beforeHash,
        afterHash,
        rationale: `Add REF ${rid}`,
      })
    );
    runJobQc();
    setStatus(`Added REF ${rid}.`);
    render();
  });

}

render();