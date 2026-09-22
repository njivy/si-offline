export const ORIGIN_KINDS = [
  'ufgs-master',
  'agency-master',
  'prior-job',
  'template',
  'blank',
  'imported-sec',
  'merged',
];

export function originLabel(origin) {
  if (!origin) return 'unknown';
  if (origin.label) return origin.label;
  switch (origin.kind) {
    case 'ufgs-master':
      return origin.masterVersion ? `UFGS ${origin.masterVersion}` : 'UFGS Master';
    case 'prior-job':
      return origin.jobName ? `from ${origin.jobName}` : 'prior job';
    case 'agency-master':
      return origin.masterName || 'agency master';
    case 'template':
      return 'template';
    case 'blank':
      return 'blank';
    case 'merged':
      return 'merged';
    default:
      return 'imported';
  }
}

export function lineageFromImport({ sectionNumber, title, currentHash, at, sourcePath }) {
  const origin = {
    kind: 'imported-sec',
    label: sourcePath ? `imported ${sourcePath}` : 'imported .sec',
    sourcePath: sourcePath || null,
  };
  return makeLineage({ sectionNumber, title, currentHash, origin, at });
}

export function lineageFromMaster({
  sectionNumber,
  title,
  currentHash,
  at,
  masterName = 'UFGS',
  masterVersion = 'unknown',
  preparingActivity = '',
  sourceHash,
  sourceDate,
}) {
  const origin = {
    kind: 'ufgs-master',
    label: `${masterName} ${masterVersion}`.trim(),
    masterName,
    masterVersion,
    sourceSectionNumber: sectionNumber,
    sourceTitle: title,
    sourceHash: sourceHash || currentHash,
    sourceDate: sourceDate || null,
    preparingActivity,
  };
  return makeLineage({ sectionNumber, title, currentHash, origin, at });
}

export function lineageFromPriorJob({
  sectionNumber,
  title,
  currentHash,
  at,
  jobName,
  jobTitle,
  jobPhase,
  sourceHash,
  sourcePath,
}) {
  const origin = {
    kind: 'prior-job',
    label: jobPhase ? `${jobName} ${jobPhase}` : jobName || 'prior job',
    jobName: jobName || '',
    jobTitle: jobTitle || '',
    jobPhase: jobPhase || null,
    sourceSectionNumber: sectionNumber,
    sourceHash: sourceHash || currentHash,
    sourcePath: sourcePath || null,
  };
  return makeLineage({ sectionNumber, title, currentHash, origin, at });
}

export function makeLineage({ sectionNumber, title, currentHash, origin, at }) {
  const when = at || new Date().toISOString();
  return {
    format: 'si-offline-lineage',
    formatVersion: 1,
    sectionNumber,
    title: title || '',
    currentHash,
    origin,
    parents: [
      {
        kind: origin.kind,
        label: originLabel(origin),
        hash: origin.sourceHash || currentHash,
        at: when,
      },
    ],
    copiedFromJob: origin.kind === 'prior-job' ? origin.jobName || null : null,
  };
}

export function updateCurrentHash(lineage, currentHash) {
  return { ...lineage, currentHash };
}
