## Offline SI v0.4.1

**UX proximity** — Pick options and QC sit next to the content of concern (Nic feedback via CoS, 23 Sep 2026 PT).

### What changed
- **Pick options** opens as a **floating popover anchored to the pink bracket run** (or caret host), not a docked pane between toolbar and paper. Apply / Job-wide batch controls stay in that same anchored UI. Selection scrolls into view when opening.
- **QC:** click a finding → **scroll + highlight** the exact bracket / RID / SRF span in the section body; inline amber marks on offending spans; anchored detail card next to the hit. The QC list remains and drives jump-to + highlight.
- SpecsIntact picker / batch / fail-closed rules unchanged from v0.4.0 — placement only.
- Dist remains Vite IIFE → `file://` double-click.

### Limits
- QC list pane is still present (navigation aid); proximity is via jump/highlight + inline marks + anchored detail.
- If a finding has no resolvable locator span, the detail card still opens near the paper (section switch still works).
- Multi-select within one bracket group still not offered (v0.4.0 limit).

### Asset
Download `si-offline-0.4.1-dist.zip`, unzip, double-click `index.html`.
