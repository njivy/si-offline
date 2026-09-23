import { parseSec } from './sec/parse.js';
import { hashSecText } from './sec/hash.js';
import { lineageFromImport, lineageFromMaster } from './lineage.js';
import { emptyJournal, pullOriginOp, appendOp } from './journal.js';
import { readZip, zipToBlob, writeZip } from './zip.js';

const SEC_NAME = /(?:^|\/)([^/]*\.sec)$/i;

export function fileBasename(path) {
  return String(path).replace(/\\/g, '/').split('/').pop();
}

export function sectionNumberFromName(name) {
  const base = fileBasename(name).replace(/\.sec$/i, '');
  return base.replace(/_/g, ' ').trim();
}

export async function loadJobFromZipBuffer(buf, { asMaster = false, sourceLabel = '' } = {}) {
  const filesMap = await readZip(buf);
  const files = Object.entries(filesMap)
    .filter(([path]) => SEC_NAME.test(path))
    .map(([path, text]) => ({ path, text }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!files.length) throw new Error('No .sec files found in the ZIP.');

  let jobMeta = null;
  const jobJsonPath = Object.keys(filesMap).find((p) => /si-offline-job\.json$/i.test(p));
  if (jobJsonPath) {
    try { jobMeta = JSON.parse(filesMap[jobJsonPath]); } catch { jobMeta = null; }
  }

  const at = new Date().toISOString();
  const sections = [];
  for (const f of files) {
    const parsed = parseSec(f.text);
    parsed._raw = f.text;
    const number = parsed.number || sectionNumberFromName(f.path);
    parsed.number = number;
    const hash = await hashSecText(f.text);
    let lineage = null;
    const linPath = Object.keys(filesMap).find((p) => p.endsWith(`lineage/${number}.lineage.json`));
    if (linPath) {
      try { lineage = JSON.parse(filesMap[linPath]); } catch { lineage = null; }
    }
    if (!lineage) {
      lineage = asMaster
        ? lineageFromMaster({
            sectionNumber: number,
            title: parsed.title,
            currentHash: hash,
            at,
            masterName: 'UFGS',
            masterVersion: 'fixture',
            preparingActivity: parsed.preparingActivity,
            sourceHash: hash,
            sourceDate: parsed.date,
          })
        : lineageFromImport({
            sectionNumber: number,
            title: parsed.title,
            currentHash: hash,
            at,
            sourcePath: f.path,
          });
    }
    let journal = null;
    const jPath = Object.keys(filesMap).find((p) => p.endsWith(`journal/${number}.journal.json`));
    if (jPath) {
      try { journal = JSON.parse(filesMap[jPath]); } catch { journal = null; }
    }
    if (!journal) {
      journal = emptyJournal({ sectionNumber: number, originHash: hash, currentHash: hash });
      journal = appendOp(journal, pullOriginOp({
        at,
        author: { displayName: 'import', id: null },
        summary: `Opened ${fileBasename(f.path)}`,
        originHash: hash,
      }));
    }
    sections.push({ number, title: parsed.title, path: f.path, text: f.text, parsed, hash, lineage, journal });
  }

  
  let outline = null;
  const outlinePath = Object.keys(filesMap).find((p) => /outline\.json$/i.test(p));
  if (outlinePath) {
    try { outline = JSON.parse(filesMap[outlinePath]); } catch { outline = null; }
  }

  return {
    sourceLabel: sourceLabel || 'ZIP',
    asMaster,
    job: jobMeta?.job || { name: guessJobName(sourceLabel), title: '', contract: '', location: '', leadSpecifier: '' },
    marking: jobMeta?.marking ?? null,
    outline: outline ? { statuses: outline.statuses || {} } : { statuses: {} },
    sections,
  };
}

function guessJobName(label) {
  if (!label) return 'JOB';
  return label.replace(/\.(zip|json)$/i, '').slice(0, 16).toUpperCase() || 'JOB';
}

export async function buildJobZip(jobState) {
  const files = {};
  files['si-offline-job.json'] = JSON.stringify({
    format: 'si-offline-job',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    job: jobState.job,
    marking: jobState.marking ?? null,
    sections: jobState.sections.map((s) => ({
      number: s.number,
      title: s.title,
      path: `${s.number}.sec`,
      contentHash: s.hash,
      originKind: s.lineage?.origin?.kind || 'imported-sec',
      originLabel: s.lineage?.origin?.label || 'imported',
    })),
  }, null, 2);
  for (const s of jobState.sections) {
    files[`${s.number}.sec`] = s.text;
    if (s.lineage) files[`lineage/${s.number}.lineage.json`] = JSON.stringify(s.lineage, null, 2);
    if (s.journal) files[`journal/${s.number}.journal.json`] = JSON.stringify(s.journal, null, 2);
  }
  if (jobState.qc) {
    files['qc.json'] = JSON.stringify({
      format: 'si-offline-qc',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      findings: jobState.qc,
    }, null, 2);
  }
  
  if (jobState.outline) {
    files['outline.json'] = JSON.stringify({
      format: 'si-offline-outline',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      statuses: jobState.outline.statuses || {},
    }, null, 2);
  }
  if (jobState.changelog) {
    files['changelog.json'] = JSON.stringify(jobState.changelog, null, 2);
    if (jobState.changelogHtml) files['changelog.html'] = jobState.changelogHtml;
    if (jobState.changelogMd) files['changelog.md'] = jobState.changelogMd;
  }

  return zipToBlob(files);
}

export async function loadJobFromSecFiles(fileList, opts = {}) {
  const files = {};
  for (const file of fileList) files[file.name] = await file.text();
  return loadJobFromZipBuffer(writeZip(files).buffer, opts);
}
