## Offline SI v0.6.0

Inline **review comments / annotations** for SME review (23 Sep 2026 PT).

### Product rules (unchanged)
- **Sidecar only** — comments never written into `.sec`. Official SpecsIntact ignores them.
- USB / `file://` double-click; no network; **no local AI**.
- Core stays SpecsIntact-safe. No proprietary `.sec` markup. No CMS/UFC pack contracts.

### Landed
1. **Per-section `annotations/{section}.annotations.json`** — `format: si-offline-annotations`, `formatVersion: 1`.
2. **Anchors** — tag path + indices, tag + text snippet/hash, optional offsets; session `nid` hint; soft reattach; orphans → section-level / “reattach needed”.
3. **UI** — select text or click a host → **Add comment**; indigo inline marks + **Comments** sidebar tab (same pattern Nic liked for QC-once); jump-to + highlight; edit / resolve / delete; author + timestamp; open/resolved.
4. **Export** — annotations travel in Job ZIP sidecars; optional Job-level `annotations.json|html|md` review export alongside changelog.
5. **Fail-closed** — never invent `.sec` markup to hold comments.

### Limits
- Anchors are soft: heavy rewrites can orphan a note (shown as reattach needed / section-level).
- Structural shells without a text host get section-level anchors.
- No WebLLM / local AI summarization.

### Asset
`si-offline-0.6.0-dist.zip` — unzip, double-click `index.html` (`file://`).
