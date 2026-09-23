## Offline SI v0.5.0

Cohesive SpecsIntact-safe offline Job editor push (23 Sep 2026 PT).

### UX (do-first)
- **QC note once** — removed the over-text / anchored-on-paper QC detail card. Jump-to + highlight + inline amber marks + **sidebar list selection** remain. Closing / body interaction no longer clears sidebar focus.

### Landed
1. **Stricter local QC before export** — export blocks on remaining brackets, unmatched tags, empty RID/SUB/SRF, illegal nests, unresolved RID, missing SRF. Jump-to findings; explicit override still writes `qc.json`.
2. **Import masters library (ZIP)** — drop once; IndexedDB/memory index for insert-section + compare-to-master (no network).
3. **Job change log / redline-style review export** — HTML/MD/JSON sidecars; `.sec` stays clean SpecsIntact text.
4. **Outline structure** — duplicate/insert section from masters when number free; mark done / needs-SME / working in sidecar only (no contract-language rewrite; no unsafe reorder).
5. **Find that understands tags** — plain text + open brackets + unresolved RID + notes; replace with fail-closed preview (refuses markup-corrupting edits).
6. **Structure forms for REF (+ PRT/SPT guidance)** — Add REF (RID+RTL) into References SPT when present; tables remain Advanced/raw fail-closed (no invented TAB shapes).
7. **Bold/italic honesty** — B/I removed from toolbar; SpecsIntact `.sec` has no character-style tags — we will not pretend.

### Deferred (fail-closed / not invented)
- Pipe-inside `[a|b]` split (still treated as one opaque option).
- Multi-select keep-many in bracket picker.
- Full WYSIWYG table authoring (TAB shapes) — SpecsIntact table model not safely inventable here.
- CMS/UFC pack contracts.

### Asset
`si-offline-0.5.0-dist.zip` — unzip, double-click `index.html` (`file://`).
