# Offline SI pack contract (v0.1)

**Status:** draft, not frozen  
**Date:** 2026-09-22 PT

## Source of truth

Native `.sec` files. No CMS, no central repo, no lock server.

Optional sidecars Official SpecsIntact ignores:

```
job/
  03 30 00.sec
  si-offline-job.json
  lineage/03 30 00.lineage.json
  journal/03 30 00.journal.json
  annotations/03 30 00.annotations.json
  outline.json
  qc.json
  changelog.json|html|md
  annotations.json|html|md   # review export (optional)
```

## Formats

| File | `format` |
|------|----------|
| Job manifest | `si-offline-job` |
| Per-section origin | `si-offline-lineage` |
| Per-section ops | `si-offline-change-journal` |
| QC snapshot | `si-offline-qc` |
| Per-section review notes | `si-offline-annotations` |
| Job annotations review export | `si-offline-annotations-review` |

`formatVersion`: `1`.

## Review annotations

Freeform SME / reviewer notes anchored to content (span or section). **Sidecar only** — never written into `.sec`.

Anchors (fail-closed soft reattach):

1. `tagPath` + `pathIndices` (structural path from SEC)
2. `tag` + `snippet` + `snippetHash`
3. optional character offsets
4. session `nid` hint (not durable across re-parse)

Orphaned anchors surface as section-level / “reattach needed”. No invented `.sec` markup.


## Origin kinds

`ufgs-master` | `agency-master` | `prior-job` | `template` | `blank` | `imported-sec` | `merged`

Lineage records parent hash + label so the UI can chip `UFGS 2026-08` vs `from FTLW-CHAPEL 35%`.

## Change journal

v0.1 writes `pull-origin` on import and `edit-text` on save (full-file hash before/after + optional rationale). Structured ops (`choose-bracket`, RID/SUB wizards) are next.

`.sec` stays coherent if sidecars are deleted.

## Hash

`sha256:` + hex of normalized `.sec` text (LF newlines, strip trailing spaces).

## QC (v0.1)

- `BRKTVER.REMAINING` / `BRKTVER.MISMATCH`
- `REFVER.UNRESOLVED` (body RID not in Reference Article)
- `SECTVER.MISSING` (SRF not in Job)

## Non-goals

CMS checkout/proposal packs, CRDT body merge, claiming Process & Print authority.
