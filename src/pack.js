import JSZip from 'jszip';
import { parseSec } from './sec/parse.js';
import { hashSecText } from './sec/hash.js';
import { lineageFromImport, lineageFromMaster } from './lineage.js';
import { emptyJournal, pullOriginOp, appendOp } from './journal.js';

const SEC_NAME = /(?:^|\/)([^/]*\.sec)$/i;

export function fileBasename(path) {
  return String(path).replace(/\\/g, '/').split('/').pop();
}

export function sectionNumberFromName(name) {
  const base = fileBasename(name).replace(/\.sec$/i, '');
  return base.replace(/_/g, ' ').trim();
}

export async function loadJobFromZipBuffer(buf, { asMaster = false, sourceLabel = '' } = {}) {
  const zip = await JSZip.loadAsync(buf);
  const files = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const norm = path.replace(/\\/g, '/');
    if (SEC_NAME.test(norm)) {
      const text = await entry.async('string');
      files.push({ path: norm, text });
    }
  }
  if (!files.length) throw new Error('No .sec files found in the ZIP.');
  files.sort((a, b) => a.path.localeCompare(b.path));

  let jobMeta = null;
  const jobJson = Object.keys(zip.files).find((p) => /si-offline-job\.json$/i.test(p.replace(/\\/g, '/')));
  if (jobJson) {
    try {
      jobMeta = JSON.parse(await zip.files[jobJson].async('string'));
    } catch {
      jobMeta = null;
    }
  }

  const at = new Date().toISOString();
  const sections = [];
  for (const f of files) {
    const parsed = parseSec(f.text);
    const number = parsed.number || sectionNumberFromName(f.path);
    parsed.number = number;
    const hash = await hashSecText(f.text);
    let lineage = null;
    const linPath = Object.keys(zip.files).find((p) =>
      p.replace(/\\/g, '/').endsWith(`lineage/${number}.lineage.json`)
    );
    if (linPath) {
      try {
        lineage = JSON.parse(await zip.files[linPath].async('string'));
      } catch {
        lineage = null;
      }
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
    const jPath = Object.keys(zip.files).find((p) =>
      p.replace(/\\/g, '/').endsWith(`journal/${number}.journal.json`)
    );
    if (jPath) {
      try {
        journal = JSON.parse(await zip.files[jPath].async('string'));
      } catch {
        journal = null;
      }
    }
    if (!journal) {
      journal = emptyJournal({ sectionNumber: number, originHash: hash, currentHash: hash });
      journal = appendOp(
        journal,
        pullOriginOp({
          at,
          author: { displayName: 'import', id: null },
          summary: `Opened ${fileBasename(f.path)}`,
          originHash: hash,
        })
      );
    }
    sections.push({
      number,
      title: parsed.title,
      path: f.path,
      text: f.text,
      parsed,
      hash,
      lineage,
      journal,
    });
  }

  return {
    sourceLabel: sourceLabel || 'ZIP',
    asMaster,
    job: jobMeta?.job || {
      name: guessJobName(sourceLabel),
      title: '',
      contract: '',
      location: '',
      leadSpecifier: '',
    },
    marking: jobMeta?.marking ?? null,
    sections,
  };
}

function guessJobName(label) {
  if (!label) return 'JOB';
  return label.replace(/\.(zip|json)$/i, '').slice(0, 16).toUpperCase() || 'JOB';
}

export async function buildJobZip(jobState) {
  const zip = new JSZip();
  const manifest = {
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
  };
  zip.file('si-offline-job.json', JSON.stringify(manifest, null, 2));
  for (const s of jobState.sections) {
    zip.file(`${s.number}.sec`, s.text);
    if (s.lineage) zip.file(`lineage/${s.number}.lineage.json`, JSON.stringify(s.lineage, null, 2));
    if (s.journal) zip.file(`journal/${s.number}.journal.json`, JSON.stringify(s.journal, null, 2));
  }
  if (jobState.qc) {
    zip.file(
      'qc.json',
      JSON.stringify(
        {
          format: 'si-offline-qc',
          formatVersion: 1,
          exportedAt: new Date().toISOString(),
          findings: jobState.qc,
        },
        null,
        2
      )
    );
  }
  return zip.generateAsync({ type: 'blob' });
}

export async function loadJobFromSecFiles(fileList, opts = {}) {
  const zip = new JSZip();
  for (const file of fileList) {
    const text = await file.text();
    zip.file(file.name, text);
  }
  const buf = await zip.generateAsync({ type: 'arraybuffer' });
  return loadJobFromZipBuffer(buf, opts);
}
