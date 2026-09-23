/**
 * Job-level change log / redline-style *review* package.
 * .sec files stay clean SpecsIntact text; review lives in sidecars only.
 */

function authorName(op) {
  return op?.author?.displayName || op?.author?.name || 'unknown';
}

export function buildJobChangelog(jobState) {
  const entries = [];
  for (const sec of jobState.sections || []) {
    for (const op of sec.journal?.entries || []) {
      entries.push({
        section: sec.number,
        title: sec.title,
        at: op.at,
        author: authorName(op),
        kind: op.kind,
        summary: op.summary || op.rationale || op.kind,
        rationale: op.rationale || null,
        beforeHash: op.beforeHash || null,
        afterHash: op.afterHash || null,
      });
    }
  }
  entries.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return {
    format: 'si-offline-changelog',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    job: jobState.job,
    entries,
  };
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function changelogToHtml(changelog) {
  const rows = (changelog.entries || [])
    .map(
      (e) => `<tr>
      <td>${esc(e.at)}</td>
      <td>${esc(e.section)}</td>
      <td>${esc(e.author)}</td>
      <td>${esc(e.kind)}</td>
      <td>${esc(e.summary || '')}</td>
      <td>${esc(e.rationale || '')}</td>
    </tr>`
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Job change log — ${esc(changelog.job?.name || '')}</title>
<style>
  body{font:14px/1.4 system-ui,sans-serif;margin:1.5rem;color:#111}
  h1{font-size:1.2rem}
  .banner{background:#fff3cd;border:1px solid #f0c36d;padding:.6rem .8rem;margin-bottom:1rem}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #ccc;padding:.35rem .5rem;vertical-align:top}
  th{background:#f4f4f5;text-align:left}
  .meta{color:#555;font-size:.85rem}
</style></head><body>
<div class="banner"><strong>Review only.</strong> This change log is an Offline SI working artifact.
Official Process &amp; Print remains SpecsIntact. Section <code>.sec</code> files in the Job ZIP stay clean SpecsIntact text.</div>
<h1>Job change log — ${esc(changelog.job?.name || '')}</h1>
<p class="meta">Exported ${esc(changelog.exportedAt)} · ${(changelog.entries || []).length} entries</p>
<table>
<thead><tr><th>When</th><th>Section</th><th>Who</th><th>Kind</th><th>What</th><th>Why</th></tr></thead>
<tbody>
${rows || '<tr><td colspan="6">No journal entries yet.</td></tr>'}
</tbody></table>
</body></html>`;
}

export function changelogToMarkdown(changelog) {
  const lines = [
    `# Job change log — ${changelog.job?.name || ''}`,
    '',
    '> Review only. .sec files remain clean SpecsIntact text. Process & Print remains official SpecsIntact.',
    '',
    `Exported: ${changelog.exportedAt}`,
    '',
    '| When | Section | Who | Kind | What | Why |',
    '|------|---------|-----|------|------|-----|',
  ];
  for (const e of changelog.entries || []) {
    lines.push(
      `| ${e.at || ''} | ${e.section || ''} | ${e.author || ''} | ${e.kind || ''} | ${mdCell(e.summary)} | ${mdCell(e.rationale)} |`
    );
  }
  if (!(changelog.entries || []).length) lines.push('| — | — | — | — | (none) | — |');
  return lines.join('\n');
}

function mdCell(s) {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
