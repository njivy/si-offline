export function emptyJournal({ sectionNumber, originHash, currentHash }) {
  return {
    format: 'si-offline-change-journal',
    formatVersion: 1,
    sectionNumber,
    originHash,
    parentHash: originHash,
    currentHash,
    entries: [],
  };
}

export function appendOp(journal, op) {
  const entries = [...(journal.entries || []), { ...op }];
  return { ...journal, entries, currentHash: op.afterHash || journal.currentHash };
}

export function pullOriginOp({ at, author, summary, originHash }) {
  return {
    opId: uid('op'),
    at: at || new Date().toISOString(),
    author: author || { displayName: 'unknown', id: null },
    kind: 'pull-origin',
    summary: summary || 'Recorded origin snapshot',
    rationale: null,
    afterHash: originHash,
  };
}

export function textEditOp({ at, author, subpart, beforeSnippet, afterSnippet, beforeHash, afterHash, rationale }) {
  return {
    opId: uid('op'),
    at: at || new Date().toISOString(),
    author: author || { displayName: 'unknown', id: null },
    kind: 'edit-text',
    target: { subpart: subpart || null, granularity: 'spt' },
    beforeSnippet: beforeSnippet || '',
    afterSnippet: afterSnippet || '',
    beforeHash,
    afterHash,
    rationale: rationale || null,
  };
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}
