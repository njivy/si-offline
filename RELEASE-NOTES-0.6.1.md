## Offline SI v0.6.1

UX polish for review comments + themes (23 Sep 2026 PT).

### Product rules (unchanged)
- **Sidecar only** — comments never written into `.sec`. Official SpecsIntact ignores them.
- USB / `file://` double-click; no network; **no local AI**.
- Core stays SpecsIntact-safe. No proprietary `.sec` markup. No CMS/UFC pack contracts.
- No invented `.sec` tag IDs for comments (parked).

### Landed
1. **Comment proximity** — select text (or a host) and **Add comment** appears as a floating bubble anchored to the selection (same proximity idea as Pick-options / QC). Sidebar **Comments** tab remains the list + secondary composer.
2. **Themes** — default elegant **light** (clean paper, restrained chrome). Optional **retro-futuristic dark** toggle. Preference in `localStorage` (`si-offline-theme`) — works on `file://`.

### Limits
- Soft anchors can orphan after heavy rewrites (reattach needed / section-level).
- Theme chrome only; SpecsIntact paper body stays readable paper in both themes.
- No WebLLM / local AI.

### Asset
`si-offline-0.6.1-dist.zip` — unzip, double-click `index.html` (`file://`).
