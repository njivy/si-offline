# Offline SI

Static browser app for **SpecsIntact-style `.sec` Jobs**: open a folder/ZIP of sections, keep **origin lineage**, record a **granular change journal**, and run QC locally.

Sibling apps: [Offline UFC Reader](https://github.com/njivy/ufc-offline-viewer), [Offline UFC Editor](https://github.com/njivy/ufc-offline-editor). Different document family — do not mix pack formats.

**Status (2026-09-23 PT):** v0.4.1 — Pick options + QC sit next to the content (anchored popover / jump-highlight). Guided SpecsIntact bracket picker with Job-wide batch, inline WYSIWYG, lineage + journal + QC, Job ZIP import/export. Dist is a Vite IIFE (`assets/app.js` + classic `defer` script) so unzip + double-click `index.html` works (`file://`). No CMS. No CRDT.

## Contract

See [PACK-CONTRACT.md](./PACK-CONTRACT.md).

- Source of truth is native `.sec` bytes.
- Optional sidecars (`si-offline-job.json`, `lineage/`, `journal/`) travel with the Job. Official SpecsIntact ignores them.
- Origin kinds: UFGS Master, prior Job, template, imported file, …
- This app does not talk to a central repo or CMS.

Offline SI edits and QC reports are working artifacts. Contractual Process & Print remains SpecsIntact until the district says otherwise.

## Run locally

```bash
npm install
npm run build:fixture
npm test
npm run dev
```

Dev server: `http://localhost:5173` (Vite; source stays ESM).

```bash
npm run build
```

Writes `dist/` with classic scripts for offline use. Open `dist/index.html` via double-click (`file://`) or any static server.

1. **Load fixture Job** — three sections; `01 33 00` and `03 30 00` share `[cast-in-place][precast]` for batch demo; `03 30 00` also has `[30 MPa][4000 psi]`, an unresolved `ACI 301` RID, and an `SRF` to `07 26 00`.
2. Or import your own ZIP / loose `.sec` files.
3. Select a section; click a pink bracket or **Pick options** for the guided picker.
4. Choose an option; when the pattern appears elsewhere, preview **N** and optionally **Apply to all N** Job-wide (journaled).
5. **Save section + journal** for other inline edits; **Export Job ZIP** writes `.sec` plus sidecars.

## Stack

Source is vanilla ESM + zero-dep `src/zip.js`. Dist is a Vite IIFE (build-time only; no runtime deps). Tests are Node scripts (no extra runner).

## Out of scope

UMRL ingest, Submittal Register publisher, CRDT, live SpecsIntact/WBDG APIs. Full character-style persistence in `.sec` (no native bold/italic tags). CMS/UFC pack contracts. TAI tailoring global hide (different SpecsIntact mechanism).
