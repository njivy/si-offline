/**
 * Offline masters / prior-Job library (IndexedDB when available, else memory).
 * Insert-section + compare-to-master — no network.
 */

const DB_NAME = 'si-offline-masters';
const DB_VER = 1;
const STORE = 'libraries';

/** @type {null | object} */
let memoryLib = null;

function openDb() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function saveMastersLibrary(lib) {
  memoryLib = lib;
  const db = await openDb();
  if (!db) return lib;
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(lib);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  return lib;
}

export async function loadMastersLibrary() {
  if (memoryLib) return memoryLib;
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get('default');
    req.onsuccess = () => {
      memoryLib = req.result || null;
      resolve(memoryLib);
    };
    req.onerror = () => resolve(null);
  });
}

export async function clearMastersLibrary() {
  memoryLib = null;
  const db = await openDb();
  if (!db) return;
  await new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete('default');
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

export function libraryFromJob(jobState, label) {
  return {
    id: 'default',
    label: label || jobState.sourceLabel || 'masters',
    importedAt: new Date().toISOString(),
    sections: (jobState.sections || []).map((s) => ({
      number: s.number,
      title: s.title,
      text: s.text,
      hash: s.hash,
      lineage: s.lineage,
    })),
  };
}

export function findInLibrary(lib, number) {
  if (!lib) return null;
  return (lib.sections || []).find((s) => s.number === number) || null;
}

export function compareTexts(masterText, jobText) {
  const a = String(masterText || '').split(/\r?\n/);
  const b = String(jobText || '').split(/\r?\n/);
  const max = Math.max(a.length, b.length);
  const rows = [];
  for (let i = 0; i < max; i++) {
    const left = a[i] ?? '';
    const right = b[i] ?? '';
    if (left === right) rows.push({ kind: 'same', left, right, line: i + 1 });
    else if (!left) rows.push({ kind: 'add', left, right, line: i + 1 });
    else if (!right) rows.push({ kind: 'del', left, right, line: i + 1 });
    else rows.push({ kind: 'change', left, right, line: i + 1 });
  }
  return { rows, changed: rows.filter((r) => r.kind !== 'same').length, total: max };
}
