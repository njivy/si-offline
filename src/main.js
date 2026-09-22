import './style.css';
import JSZip from 'jszip';
import { loadJobFromZipBuffer, loadJobFromSecFiles, buildJobZip } from './pack.js';
import { renderSectionHtml, escapeHtml } from './render.js';
import { runQc, summarizeFindings } from './qc/index.js';
import { originLabel, updateCurrentHash } from './lineage.js';
import { serializeSec } from './sec/serialize.js';
import { hashSecText } from './sec/hash.js';
import { appendOp, textEditOp } from './journal.js';

const SAMPLE = './fixtures/job-minimal.zip';
const app = document.querySelector('#app');

let state = {
  view: 'home',
  job: null,
  selected: null,
  findings: [],
  status: '',
  error: '',
  authorName: localStorage.getItem('si-offline-author') || '',
  rationale: '',
  showNotes: true,
};

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

async function saveTextEdit() {
  const sec = selectedSection();
  if (!sec) return;
  const ta = document.getElementById('raw-sec');
  if (!ta) return;
  const next = ta.value;
  const rationale = (document.getElementById('edit-rationale')?.value || '').trim();
  const beforeHash = sec.hash;
  const afterHash = await hashSecText(next);
  if (beforeHash === afterHash) {
    setStatus('No byte change.');
    return;
  }
  sec.text = next;
  sec.hash = afterHash;
  const { parseSec } = await import('./sec/parse.js');
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
  state.status = `Saved ${sec.number} · ${afterHash.slice(0, 18)}…`;
  render();
}

function renderHome() {
  return `
    <div class="proposal-banner">
      Offline SI — <strong>.sec files</strong> are the source of truth. No CMS. Not contractual Process &amp; Print.
    </div>
    <header class="topbar">
      <h1>Offline SI</h1>
      <span class="meta">v0.1.0 · lineage + QC</span>
    </header>
    <main class="main">
      <div class="card">
        <h3>Open a Job of .sec files</h3>
        <p class="hint">Import a ZIP of sections or loose <code>.sec</code> files.</p>
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
  const rows = job.sections.map((s) => {
    const kind = s.lineage?.origin?.kind || 'imported-sec';
    const active = s.number === state.selected ? 'active' : '';
    const nFind = state.findings.filter((f) => f.section === s.number).length;
    return `<li><div class="toc-row ${active}" data-sec="${escapeHtml(s.number)}">
      <span class="toc-num">${escapeHtml(s.number)}</span>
      <span class="toc-title">${escapeHtml(s.title || '')}</span>
      <span class="chip ${chipClass(kind)}">${escapeHtml(originLabel(s.lineage?.origin))}</span>
      ${nFind ? `<span class="hint">${nFind} finding(s)</span>` : ''}
    </div></li>`;
  }).join('');
  const findings = state.findings.map((f) => `<div class="finding ${escapeHtml(f.severity)}" data-jump="${escapeHtml(f.section)}">
    <div class="code">${escapeHtml(f.code)}</div>
    <p><strong>${escapeHtml(f.section)}</strong> — ${escapeHtml(f.message)}</p>
  </div>`).join('');
  const origin = sec?.lineage?.origin;
  const paper = sec ? renderSectionHtml(sec.parsed, { showNotes: state.showNotes, showTags: true }) : '<p class="hint">Select a section.</p>';
  return `
    <div class="proposal-banner">Offline SI — working files only. Process &amp; Print remains official SpecsIntact.</div>
    <header class="topbar">
      <h1>Offline SI</h1>
      <span class="meta">${escapeHtml(job.job.name || '')} · ${job.sections.length} sections · ${q.errors} QC errors</span>
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
            ? `<div class="card">
          <h3>${escapeHtml(sec.number)} ${escapeHtml(sec.title || '')}</h3>
          <p class="meta-line">Origin: <span class="chip ${chipClass(origin?.kind)}">${escapeHtml(originLabel(origin))}</span> · hash <code>${escapeHtml(sec.hash)}</code></p>
          <p class="meta-line">Journal entries: ${sec.journal?.entries?.length || 0}</p>
          <div class="paper">${paper}</div>
        </div>
        <div class="card">
          <h3>Raw .sec (tracked save)</h3>
          <div class="field"><label for="author-name">Author display name</label><input id="author-name" value="${escapeHtml(state.authorName)}" /></div>
          <div class="field"><label for="edit-rationale">Rationale</label><textarea id="edit-rationale">${escapeHtml(state.rationale)}</textarea></div>
          <div class="field"><label for="raw-sec">Section source</label><textarea id="raw-sec" style="min-height:14rem;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:0.78rem">${escapeHtml(sec.text)}</textarea></div>
          <div class="actions"><button type="button" class="primary" id="btn-save">Save section + journal</button></div>
        </div>`
            : ''
        }
      </main>
      <aside class="qc-pane"><h2>QC · ${q.total}</h2>${findings || '<p class="hint">No findings.</p>'}</aside>
    </div>`;
}

function render() {
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
    render();
  });
  document.getElementById('btn-export')?.addEventListener('click', exportJob);
  document.getElementById('btn-save')?.addEventListener('click', saveTextEdit);
  document.getElementById('author-name')?.addEventListener('change', (e) => {
    state.authorName = e.target.value;
    localStorage.setItem('si-offline-author', state.authorName);
  });
  document.getElementById('edit-rationale')?.addEventListener('input', (e) => {
    state.rationale = e.target.value;
  });
  document.querySelectorAll('.toc-row[data-sec]').forEach((el) => {
    el.addEventListener('click', () => {
      state.selected = el.getAttribute('data-sec');
      render();
    });
  });
  document.querySelectorAll('.finding[data-jump]').forEach((el) => {
    el.addEventListener('click', () => {
      state.selected = el.getAttribute('data-jump');
      render();
    });
  });
}

render();
void serializeSec;
void JSZip;
