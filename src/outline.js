/**
 * Outline metadata (done / needs-SME) and safe section insert from masters library.
 * Status lives in Job sidecar only — never mutates contract language in .sec.
 */

export const SECTION_STATUSES = ['working', 'needs-sme', 'done'];

export function getSectionStatus(jobState, number) {
  const map = jobState?.outline?.statuses || {};
  return map[number] || 'working';
}

export function setSectionStatus(jobState, number, status) {
  if (!SECTION_STATUSES.includes(status)) return jobState;
  const outline = { ...(jobState.outline || {}), statuses: { ...(jobState.outline?.statuses || {}) } };
  outline.statuses[number] = status;
  return { ...jobState, outline };
}

/**
 * Insert a section from masters library into the Job if the number is not already present.
 * Fail-closed if duplicate number.
 */
export function insertSectionFromLibrary(jobState, libSection, { lineageFactory, journalFactory, parseSec, hashSecText }) {
  if (!libSection?.number || !libSection?.text) {
    return { ok: false, reason: 'Library section missing number/text.' };
  }
  if ((jobState.sections || []).some((s) => s.number === libSection.number)) {
    return { ok: false, reason: `Section ${libSection.number} already in Job (fail-closed).` };
  }
  return {
    ok: true,
    async build() {
      const text = libSection.text;
      const parsed = parseSec(text);
      parsed.number = parsed.number || libSection.number;
      parsed._raw = text;
      const hash = await hashSecText(text);
      const at = new Date().toISOString();
      const lineage = lineageFactory({
        sectionNumber: parsed.number,
        title: parsed.title || libSection.title,
        currentHash: hash,
        at,
        sourcePath: `masters:${libSection.number}`,
      });
      let journal = journalFactory({
        sectionNumber: parsed.number,
        originHash: hash,
        currentHash: hash,
      });
      return {
        number: parsed.number,
        title: parsed.title || libSection.title,
        path: `${parsed.number}.sec`,
        text,
        parsed,
        hash,
        lineage,
        journal,
      };
    },
  };
}
